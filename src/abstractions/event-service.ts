import { Result } from "../entities/utils/result";

export default interface EventService {
  publish(event: string, payload: any): void
}