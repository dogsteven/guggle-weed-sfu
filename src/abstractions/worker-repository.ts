import { types } from "mediasoup";

export default interface WorkerRepository {
  pickWorker(): types.Worker;
}