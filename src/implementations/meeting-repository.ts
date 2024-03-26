import Meeting from "../entities/meeting";
import WorkerRepository from "../abstractions/worker-repository";
import MeetingRepository from "../abstractions/meeting-repository";
import { v4 } from "uuid";

export default class MeetingRepositoryImplementation implements MeetingRepository {
  private readonly _workerRepository: WorkerRepository;
  private readonly _meetings: Map<any, Meeting>;

  public constructor(services: {
    workerRepository: WorkerRepository
  }) {
    this._workerRepository = services.workerRepository;
    this._meetings = new Map<any, Meeting>();
  }

  public async create(hostId: any): Promise<Meeting> {
    const meeting = await Meeting.create(v4(), hostId, this._workerRepository.pickWorker());

    this._meetings.set(meeting.id, meeting);

    return meeting;
  }

  public get(id: any): Meeting {
    if (!this._meetings.has(id)) {
      throw `There is no meeting with id ${id}`;
    }

    return this._meetings.get(id);
  }

  public delete(id: any) {
    this._meetings.delete(id);
  }
}