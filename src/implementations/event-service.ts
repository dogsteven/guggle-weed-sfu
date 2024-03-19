import EventService, { Message } from "../abstractions/event-service";
import { RedisClientType } from "redis";
import { v4 } from "uuid";

export default class EventServiceImplementation implements EventService {
  private readonly _redisPublisher: RedisClientType;
  
  public constructor(services: {
    redisPublisher: RedisClientType
  }) {
    this._redisPublisher = services.redisPublisher;
  }

  public publish(message: Message) {
    this.safePublish({
      ...message,
      id: v4()
    });
  }

  private async safePublish(message: { id: string, event: string, payload: any }, times: number = 1) {
    if (times > 5) {
      return;
    }

    try {
      await this._redisPublisher.publish("guggle-weed-sfu", JSON.stringify(message));
    } catch {
      setTimeout(() => {
        this.safePublish(message, times + 1);
      }, 200 * times);
    }
  }
}