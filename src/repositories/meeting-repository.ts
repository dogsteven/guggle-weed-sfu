import { Result } from "../entities/utils/result";
import Meeting from "../entities/meeting";
import WorkerRepository from "./worker-repository";
import { v4 } from "uuid";

export default class MeetingRepository {
  private readonly _workerRepository: WorkerRepository;
  private readonly _meetings: Map<any, Meeting>;

  public constructor(services: {
    workerRepository: WorkerRepository
  }) {
    this._workerRepository = services.workerRepository;
    this._meetings = new Map<any, Meeting>();
  }

  public get(id: any): Result<Meeting> {
    if (!this._meetings.has(id)) {
      return {
        status: "failed",
        message: `There is no meeting with id ${id}`
      };
    }

    return {
      status: "success",
      data: this._meetings.get(id)
    };
  }

  public async create(hostId: any): Promise<Meeting> {
    const meeting = await Meeting.create(v4(), hostId, this._workerRepository.worker);

    meeting.once("meetingEnded", () => {
      this._meetings.delete(meeting.id)
    });

    this._meetings.set(meeting.id, meeting);

    return meeting;
  }
}