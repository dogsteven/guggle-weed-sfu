import Meeting from "../entities/meeting";

export default interface MeetingRepository {
  create(): Promise<Meeting>;
  get(id: any): Meeting;
  delete(id: any): void;
}