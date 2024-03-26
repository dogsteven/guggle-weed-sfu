import { createContainer, asValue, asClass, InjectionMode } from "awilix";
import express, { Application as ExpressApplication } from "express";
import { createServer as createHttpServer, Server as HttpServer } from "http";
import WorkerRepositoryImplementation from "./implementations/worker-repository";
import MeetingRepositoryImplementation from "./implementations/meeting-repository";
import EventService from "./abstractions/event-service";
import { ProducerType, TransportType } from "./entities/attendee";
import { types } from "mediasoup";
import cors from "cors";
import MeetingRepository from "./abstractions/meeting-repository";
import EventServiceImplementation from "./implementations/event-service";
import serverConfiguration from "./configurations/serverConfiguration";
import { createClient } from "redis";
import { wrapResult, wrapResultAsync, wrapVoid, wrapVoidAsync } from "./utils/result";

class GuggleWeedApplication {
  private readonly _expressApplication: ExpressApplication;
  private readonly _httpServer: HttpServer;
  private readonly _eventService: EventService;
  private readonly _meetingRepository: MeetingRepository;

  public constructor(services: {
    expressApplication: ExpressApplication,
    httpsServer: HttpServer,
    eventService: EventService,
    meetingRepository: MeetingRepository
  }) {
    this._expressApplication = services.expressApplication;
    this._httpServer = services.httpsServer;
    this._eventService = services.eventService;
    this._meetingRepository = services.meetingRepository;
  }

  private static async buildContainer() {
    const container = createContainer({
      injectionMode: InjectionMode.PROXY,
      strict: true
    });

    const expressApplication = express();

    const httpsServer = createHttpServer(expressApplication);

    const workerRepository = await WorkerRepositoryImplementation.create();

    const redisPublisher = createClient();

    await redisPublisher.connect();
  
    container.register({
      expressApplication: asValue(expressApplication),
      httpsServer: asValue(httpsServer),
      workerRepository: asValue(workerRepository),
      redisPublisher: asValue(redisPublisher)
    });

    container.register({
      eventService: asClass(EventServiceImplementation).singleton(),
      meetingRepository: asClass(MeetingRepositoryImplementation).singleton()
    });

    container.register({
      application: asClass(GuggleWeedApplication).singleton()
    });

    return container;
  }

  public static async main() {
    const container = await this.buildContainer();

    const application = container.resolve("application") as GuggleWeedApplication;

    await application.boot();
    await application.listen();
  }

  private bootMiddlewares() {
    this._expressApplication.use(cors({
      origin: `${serverConfiguration.mediaBroker.host}:${serverConfiguration.mediaBroker.port}`,
      methods: "GET,POST",
      optionsSuccessStatus: 200
    }));
  }

  private bootMeetingSection() {
    this._expressApplication.get("/meetings/:meetingId", async (request, response) => {
      response.json(wrapResult(() => {
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        return {
          attendees: meeting.attendees
        };
      }));
    });

    this._expressApplication.post("/meetings/start", async (request, response) => {
      response.json(await wrapResultAsync(async () => {
        const username = request.headers["x-username"] as string;

        const meeting = await this._meetingRepository.create(username);

        return {
          meetingId: meeting.id
        };
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/end", async (request, response) => {
      response.json(wrapVoid(() => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        if (meeting.hostId !== username) {
          throw `You don't have permission to end this meeting`;
        }

        meeting.end();

        this._meetingRepository.delete(meeting.id);
      }));
    });
  }

  private bootAttendeeSection() {
    this._expressApplication.post("/meetings/:meetingId/join", async (request, response) => {
      response.json(await wrapResultAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { attendee, sendTransport, receiveTransport } = await meeting.addAttendee(username);

        attendee.once("error", () => {
          this._eventService.publish("guggle-weed-sfu", {
            event: "attendeeError",
            payload: {
              meetingId: meeting.id,
              attendeId: attendee.id
            }
          });
        });

        return {
          routerRtpCapabilities: meeting.routerRtpCapabilities,
          sendTransport: {
            id: sendTransport.id,
            iceParameters: sendTransport.iceParameters,
            iceCandidates: sendTransport.iceCandidates,
            dtlsParameters: sendTransport.dtlsParameters
          },
          receiveTransport: {
            id: receiveTransport.id,
            iceParameters: receiveTransport.iceParameters,
            iceCandidates: receiveTransport.iceCandidates,
            dtlsParameters: receiveTransport.dtlsParameters
          },
        };
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/connect", async (request, response) => {
      response.json(await wrapVoidAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { transportType, dtlsParameters } = request.body as { transportType: TransportType, dtlsParameters: types.DtlsParameters };

        await meeting.connectTransport(username, transportType, dtlsParameters);
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/leave", async (request, response) => {
      response.json(wrapVoid(() => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId

        const meeting = this._meetingRepository.get(meetingId);

        meeting.removeAttendee(username)
      }));
    });
  }

  private bootProducerSection() {
    this._expressApplication.post("/meetings/:meetingId/produceMedia", async (request, response) => {
      response.json(await wrapResultAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { appData: { producerType }, rtpParameters } = request.body as { appData: { producerType: ProducerType }, rtpParameters: types.RtpParameters };

        const producer = await meeting.produceMedia(username, producerType, rtpParameters);

        return {
          producerId: producer.id
        };
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/closeProducer", async (request, response) => {
      response.json(wrapVoid(() => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { producerType } = request.body as { producerType: ProducerType };

        meeting.closeProducer(username, producerType);
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/pauseProducer", async (request, response) => {
      response.json(await wrapVoidAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { producerType } = request.body as { producerType: ProducerType };

        await meeting.pauseProducer(username, producerType);
      }));
    })

    this._expressApplication.post("/meetings/:meetingId/resumeProducer", async (request, response) => {
      response.json(await wrapVoidAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { producerType } = request.body as { producerType: ProducerType };

        await meeting.resumeProducer(username, producerType);
      }));
    });
  }

  private bootConsumerSection() {
    this._expressApplication.post("/meetings/:meetingId/consumeMedia", async (request, response) => {
      response.json(await wrapResultAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { producerId, rtpCapabilities } = request.body as { producerId: string, rtpCapabilities: types.RtpCapabilities };

        const consumer = await meeting.consumeMedia(username, producerId, rtpCapabilities);

        consumer.observer.on("close", () => {
          this._eventService.publish("guggle-weed-sfu", {
            event: "consumerClosed",
            payload: {
              meetingId: meeting.id,
              attendeeId: username,
              consumerId: consumer.id
            }
          });
        });

        consumer.observer.on("pause", () => {
          this._eventService.publish("guggle-weed-sfu", {
            event: "consumerPaused",
            payload: {
              meetingId: meeting.id,
              attendeeId: username,
              consumerId: consumer.id
            }
          });
        });

        consumer.observer.on("resume", () => {
          this._eventService.publish("guggle-weed-sfu", {
            event: "consumerResumed",
            payload: {
              meetingId: meeting.id,
              attendeeId: username,
              consumerId: consumer.id
            }
          });
        });

        return {
          id: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        };
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/pauseConsumer", async (request, response) => {
      response.json(await wrapVoidAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;

        const meeting = this._meetingRepository.get(meetingId);

        const { consumerId } = request.body as { consumerId: string };

        await meeting.pauseConsumer(username, consumerId);
      }));
    });

    this._expressApplication.post("/meetings/:meetingId/resumeConsumer", async (request, response) => {
      response.json(await wrapVoidAsync(async () => {
        const username = request.headers["x-username"] as string;
        const meetingId = request.params.meetingId;
  
        const meeting = this._meetingRepository.get(meetingId);
  
        const { consumerId } = request.body as { consumerId: string };
  
        await meeting.resumeConsumer(username, consumerId);
      }));
    });
  }

  private async boot() {
    this.bootMiddlewares();
    this.bootMeetingSection();
    this.bootAttendeeSection();
    this.bootProducerSection();
    this.bootConsumerSection();
  }

  private async listen() {
    this._httpServer.listen(serverConfiguration.server.listenPort, () => {
      console.log(`Server is running at http://${serverConfiguration.server.listenIp}:${serverConfiguration.server.listenPort}`);
    });
  }
}

GuggleWeedApplication.main();