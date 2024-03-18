import eventServiceConfiguration from "../configurations/eventServiceConfiguration";
import EventService from "../abstractions/event-service";
import { v4 } from "uuid";
import axios from "axios";

type Message = {
  id: any;
  event: string;
  payload: any;
}

export default class EventServiceImplementation implements EventService {
  private static readonly _serviceUrl = `${eventServiceConfiguration.host}:${eventServiceConfiguration.port}/event-service`;
  private static readonly _retryIntervals = [100, 200, 400, 800, 1600];

  public constructor() {}

  public publish(event: string, payload: any): void {
    const message: Message = {
      id: v4(),
      event: event,
      payload: payload
    };

    this.execute(message);
  }

  private request(message: Message): Promise<any> {
    return axios({
      method: "post",
      url: EventServiceImplementation._serviceUrl,
      headers: {
        "Content-Type": "application/json"
      },
      data: {
        event: message.event,
        payload: message.payload
      }
    });
  }
  
  public async execute(message: Message, times: number = 0) {
    try {
      await this.request(message);
    } catch (error) {
      if (times < EventServiceImplementation._retryIntervals.length) {
        setTimeout(() => {
          this.execute(message, times + 1);
        }, EventServiceImplementation._retryIntervals[times]);
      }
    }
  }
}