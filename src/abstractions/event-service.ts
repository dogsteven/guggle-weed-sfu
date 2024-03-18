import { Result } from "../entities/utils/result";

export default interface EventService {
  publish(meetingId: any, event: string, payload: any): void
}