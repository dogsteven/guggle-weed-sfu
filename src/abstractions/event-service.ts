export type Message = {
  event: string;
  payload: any;
}

export default interface EventService {
  publish(message: Message): void
}