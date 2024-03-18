export default interface EventService {
  publish(event: string, payload: any): void
}