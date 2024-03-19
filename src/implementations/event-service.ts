import serverConfiguration from "../configurations/serverConfiguration";
import EventService, { Message } from "../abstractions/event-service";
import axios from "axios";

export default class EventServiceImplementation implements EventService {
  private static readonly _serviceUrl = `${serverConfiguration.eventService.host}:${serverConfiguration.eventService.port}/event-service`;
  private static readonly _retryIntervals = [100, 200, 300, 400, 500];
  
  public constructor() {}

  public publish(message: Message) {
    this.send(message);
  }

  private async send(message: Message, times: number = 0) {
    try {
      await axios({
        url: EventServiceImplementation._serviceUrl,
        method: "post",
        headers: {
          "Content-Type": "application/json"
        },
        data: {
          message: message
        }
      });
    } catch {
      if (times < EventServiceImplementation._retryIntervals.length) {
        setTimeout(() => {
          this.send(message, times + 1);
        }, EventServiceImplementation._retryIntervals[times]);
      }
    }
  }
}