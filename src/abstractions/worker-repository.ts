import { types } from "mediasoup";

export default interface WorkerRepository {
  get worker(): types.Worker;
}