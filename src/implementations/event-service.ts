import eventServiceConfiguration from "../configurations/eventServiceConfiguration";
import EventService from "../abstractions/event-service";
import axios from "axios";

export default class EventServiceImplementation implements EventService {
  private static readonly _serviceUrl = `${eventServiceConfiguration.eventService.host}:${eventServiceConfiguration.eventService.port}/event-service`;
  private static readonly _retryIntervals = [100, 200, 400, 800, 1600];

  public constructor() {}

  public publish(event: string, payload: any): void {
    this.execute(event, payload);
  }

  private request(event: string, payload: any): Promise<any> {
    return axios({
      method: "post",
      url: EventServiceImplementation._serviceUrl,
      headers: {
        "Content-Type": "application/json"
      },
      data: {
        event: event,
        payload: payload
      }
    });
  }
  
  public async execute(event: string, payload: any, times: number = 0) {
    try {
      await this.request(event, payload);
    } catch (error) {
      if (times < EventServiceImplementation._retryIntervals.length) {
        setTimeout(() => {
          this.execute(event, payload, times + 1);
        }, EventServiceImplementation._retryIntervals[times]);
      }
    }
  }
}