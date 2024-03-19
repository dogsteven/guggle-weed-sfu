import EventService, { Message } from "../abstractions/event-service";
import { RedisClientType } from "redis";

export default class EventServiceImplementation implements EventService {
  private readonly _redisPublisher: RedisClientType;
  
  public constructor(services: {
    redisPublisher: RedisClientType
  }) {
    this._redisPublisher = services.redisPublisher;
  }

  public publish(message: Message) {
    this._redisPublisher.publish("guggle-weed-sfu", JSON.stringify(message));
  }
}