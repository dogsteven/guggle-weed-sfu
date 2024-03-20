export type Message = {
  event: string;
  payload: any;
}

export default interface EventService {
  publish(queue: string, message: Message): void
}