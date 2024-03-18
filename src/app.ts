import fs from "fs";
import path from "path";
import awilix from "awilix";
import express, { Application as ExpressApplication } from "express";
import { createServer as createHttpsServer, Server as HttpsServer } from "https";
import WorkerRepositoryImplementation from "./implementations/worker-repository";
import MeetingRepositoryImplementation from "./implementations/meeting-repository";
import EventService from "./abstractions/event-service";
import mediasoupConfiguration from "./configurations/mediasoupConfiguration";
import { ProducerType, TransportType } from "./entities/attendee";
import { types } from "mediasoup";
import MeetingRepository from "./abstractions/meeting-repository";

async function buildContainer() {
  try {
    const container = awilix.createContainer({
      injectionMode: awilix.InjectionMode.PROXY,
      strict: true
    });

    const expressApplication = express();

    const httpsServer = createHttpsServer({
      key: fs.readFileSync(path.resolve(__dirname, "../ssl/key.pem"), "utf-8"),
      cert: fs.readFileSync(path.resolve(__dirname, "../ssl/cert.pem"), "utf-8")
    }, expressApplication);

    // const socketIO = new SocketIOServer(httpsServer);

    const workerRepository = await WorkerRepositoryImplementation.create();
  
    container.register({
      expressApplication: awilix.asValue(expressApplication),
      httpsServer: awilix.asValue(httpsServer),
      // socketIO: awilix.asValue(socketIO),
      workerRepository: awilix.asValue(workerRepository),
      meetingRepository: awilix.asClass(MeetingRepositoryImplementation, { lifetime: awilix.Lifetime.SINGLETON })
    });

    return container;
  } catch {
    return null;
  }
}

class GuggleWeedApplication {
  private readonly _expressApplication: ExpressApplication;
  private readonly _httpsServer: HttpsServer;
  private readonly _eventService: EventService;
  private readonly _meetingRepository: MeetingRepository;

  public constructor(services: {
    expressApplication: ExpressApplication,
    httpsServer: HttpsServer,
    eventService: EventService,
    meetingRepository: MeetingRepositoryImplementation
  }) {
    this._expressApplication = services.expressApplication;
    this._httpsServer = services.httpsServer;
    this._eventService = services.eventService;
    this._meetingRepository = services.meetingRepository;
  }

  private bootMeetingSection() {
    this._expressApplication.post("/startMeeting", async (request, response) => {
      const username = request.headers["x-username"] as string;

      const meeting = await this._meetingRepository.create(username);

      meeting.on("attendeeLeft", (attendeeId) => {
        this._eventService.publish("attendeeLeft", {
          meetingId: meeting.id,
          attendeeId: attendeeId
        });
      });

      meeting.once("meetingEnded", () => {
        this._eventService.publish("meetingEnded", {
          meetingId: meeting.id
        });
      });

      response.json({
        status: "success",
        data: {
          meetingId: meeting.id
        }
      });
    });

    this._expressApplication.post("/endMeeting", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      if (meeting.hostId !== username) {
        response.json({
          status: "failed",
          message: `You don't have permission to end this meeting`
        });
        return;
      }

      const endingResult = meeting.end();

      response.json(endingResult);
    });
  }

  private bootAttendeeSection() {
    this._expressApplication.post("/joinMeeting/:meetingId", async (request, response) => {
      const username = request.headers["x-username"] as string;
      
      const meetingId = request.params.meetingId;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const joiningResult = await meeting.addAttendee(username);

      if (joiningResult.status === "failed") {
        response.json(joiningResult);
        return;
      }

      const { sendTransport, receiveTransport } = joiningResult.data;

      response.json({
        status: "success",
        data: {
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
        }
      });
    });

    this._expressApplication.post("/connectTransport", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { transportType, dtlsParameters } = request.body as { transportType: TransportType, dtlsParameters: types.DtlsParameters };

      const connectingResult = await meeting.connectTransport(username, transportType, dtlsParameters);

      response.json(connectingResult);
    });

    this._expressApplication.post("/leaveMeeting", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const leavingResult = meeting.removeAttendee(username);

      response.json(leavingResult);
    });
  }

  private bootProducerSection() {
    this._expressApplication.post("/produceMedia", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { appData: { producerType }, rtpParameters } = request.body as { appData: { producerType: ProducerType }, rtpParameters: types.RtpParameters };

      const producerResult = await meeting.produceMedia(username, producerType, rtpParameters);

      if (producerResult.status === "failed") {
        response.json(producerResult);
        return;
      }

      const producer = producerResult.data;

      producer.observer.once("close", () => {
        this._eventService.publish("producerClosed", {
          meetingId: meeting.id,
          attendeeId: username,
          producerType: producerType,
          producerId: producer.id
        });
      });

      producer.observer.on("pause", () => {
        this._eventService.publish("producerPaused", {
          meetingId: meeting.id,
          attendeeId: username,
          producerType: producerType,
          producerId: producer.id
        });
      });

      producer.observer.on("resume", () => {
        this._eventService.publish("producerResumed", {
          meetingId: meeting.id,
          attendeeId: username,
          producerType: producerType,
          producerId: producer.id
        });
      });

      this._eventService.publish("producerCreated", {
        meetingId: meeting.id,
        attendeeId: username,
        producerId: producer.id
      });

      response.json({
        producerId: producer.id
      });
    });

    this._expressApplication.post("/closeProducer", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { producerType } = request.body as { producerType: ProducerType };

      const closingResult = meeting.closeProducer(username, producerType);

      response.json(closingResult);
    });

    this._expressApplication.post("/pauseProducer", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { producerType } = request.body as { producerType: ProducerType };

      const pausingResult = await meeting.pauseProducer(username, producerType);

      response.json(pausingResult);
    })

    this._expressApplication.post("/resumeProducer", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { producerType } = request.body as { producerType: ProducerType };

      const resumingResult = await meeting.resumeProducer(username, producerType);

      response.json(resumingResult);
    });
  }

  private bootConsumerSection() {
    this._expressApplication.post("/consumeMedia", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { producerId, rtpCapabilities } = request.body as { producerId: string, rtpCapabilities: types.RtpCapabilities };

      const consumerResult = await meeting.consumeMedia(username, producerId, rtpCapabilities);

      if (consumerResult.status === "failed") {
        response.json(consumerResult);
        return;
      }

      const consumer = consumerResult.data;

      consumer.observer.on("close", () => {
        this._eventService.publish("consumerClosed", {
          meetingId: meeting.id,
          attendeeId: username,
          consumerId: consumer.id
        });
      });

      consumer.observer.on("pause", () => {
        this._eventService.publish("consumerPaused", {
          meetingId: meeting.id,
          attendeeId: username,
          consumerId: consumer.id
        });
      });

      consumer.observer.on("resume", () => {
        this._eventService.publish("consumerResumed", {
          meetingId: meeting.id,
          attendeeId: username,
          consumerId: consumer.id
        });
      });

      response.json({
        status: "success",
        data: {
          id: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        }
      });
    });

    this._expressApplication.post("/pauseConsumer", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { consumerId } = request.body as { consumerId: string };

      const pausingResult = await meeting.pauseConsumer(username, consumerId);

      response.json(pausingResult);
    });

    this._expressApplication.post("/resumeConsumer", async (request, response) => {
      const username = request.headers["x-username"] as string;
      const meetingId = request.headers["x-meeting-id"] as string;

      const meetingResult = this._meetingRepository.get(meetingId);

      if (meetingResult.status === "failed") {
        response.json(meetingResult);
        return;
      }

      const meeting = meetingResult.data;

      const { consumerId } = request.body as { consumerId: string };

      const resumingResult = await meeting.resumeConsumer(username, consumerId);

      response.json(resumingResult);
    });
  }

  public async boot() {
    this.bootMeetingSection();
    this.bootAttendeeSection();
    this.bootProducerSection();
    this.bootConsumerSection();
  }

  public async listen() {
    this._httpsServer.listen(mediasoupConfiguration.server.listenPort, () => {
      console.log(`Server is running at https://${mediasoupConfiguration.server.listenIp}:${mediasoupConfiguration.server.listenPort}`);
    });
  }
}