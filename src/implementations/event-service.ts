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

  public publish(queue: string, message: Message) {
    this.safePublish(queue, JSON.stringify({
      ...message,
      timestamp: new Date(Date.now())
    }));
  }

  private async safePublish(queue: string, message: string, times: number = 1) {
    if (times > 5) {
      return;
    }

    try {
      await this._redisPublisher.publish(queue, message);
    } catch {
      setTimeout(() => {
        this.safePublish(queue, message, times + 1);
      }, 200 * times);
    }
  }
}