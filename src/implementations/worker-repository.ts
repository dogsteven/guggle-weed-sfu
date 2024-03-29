import { createWorker, types } from "mediasoup";
import mediasoupConfiguration from "../configurations/mediasoupConfiguration";
import WorkerRepository from "../abstractions/worker-repository";

export default class WorkerRepositoryImplementation implements WorkerRepository {
  private readonly _workers: types.Worker[];
  private _currentWorkerIndex: number;

  private constructor(workers: types.Worker[]) {
    this._workers = workers;
    this._currentWorkerIndex = 0;
  }

  public static async create(): Promise<WorkerRepositoryImplementation> {
    const workers: types.Worker[] = [];

    for (let i = 0; i < mediasoupConfiguration.mediasoup.numWorkers; ++i) {
      const worker = await createWorker(mediasoupConfiguration.mediasoup.worker);

      worker.on("died", () => {
        setTimeout(() => process.exit(1), 2000);
      });

      workers.push(worker);
    }

    return new WorkerRepositoryImplementation(workers);
  }

  public pickWorker(): types.Worker {
    const worker = this._workers[this._currentWorkerIndex];

    this._currentWorkerIndex = (this._currentWorkerIndex + 1) % this._workers.length;

    return worker;
  }
}