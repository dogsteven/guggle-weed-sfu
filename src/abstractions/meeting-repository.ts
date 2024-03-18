import { Result } from "../entities/utils/result";
import Meeting from "../entities/meeting";

export default interface MeetingRepository {
  create(hostId: any): Promise<Meeting>;
  get(id: any): Result<Meeting>;
}