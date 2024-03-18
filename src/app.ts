import fs from "fs";
import path from "path";
import awilix from "awilix";
import express, { Application as ExpressApplication } from "express";
import { createServer as createHttpsServer, Server as HttpsServer } from "https";
import { Server as SocketIOServer, Socket } from "socket.io";
import WorkerRepository from "./repositories/worker-repository";
import MeetingRepository from "./repositories/meeting-repository";
import EventService from "./abstractions/event-service";
import mediasoupConfiguration from "./configurations/mediasoupConfiguration";
import { memoryUsage } from "process";
import { ProducerType, TransportType } from "./entities/attendee";
import { types } from "mediasoup";

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

    const socketIO = new SocketIOServer(httpsServer);

    const workerRepository = await WorkerRepository.create();
  
    container.register({
      expressApplication: awilix.asValue(expressApplication),
      httpsServer: awilix.asValue(httpsServer),
      socketIO: awilix.asValue(socketIO),
      workerRepository: awilix.asValue(workerRepository),
      meetingRepository: awilix.asClass(MeetingRepository, { lifetime: awilix.Lifetime.SINGLETON })
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
  private readonly _socketIO: SocketIOServer;
  private readonly _meetingRepository: MeetingRepository;

  public constructor(services: {
    expressApplication: ExpressApplication,
    httpsServer: HttpsServer,
    eventService: EventService,
    socketIO: SocketIOServer,
    meetingRepository: MeetingRepository
  }) {
    this._expressApplication = services.expressApplication;
    this._httpsServer = services.httpsServer;
    this._eventService = services.eventService;
    this._socketIO = services.socketIO;
    this._meetingRepository = services.meetingRepository;
  }

  public async boot() {
  }

  public async listen() {
    this._httpsServer.listen(mediasoupConfiguration.listenPort, () => {
      console.log(`Server is running at https://localhost:${mediasoupConfiguration.listenPort}`);
    });
  }
}