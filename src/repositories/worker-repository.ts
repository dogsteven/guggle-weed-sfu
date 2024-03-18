import { createWorker, types } from "mediasoup";
import mediasoupConfiguration from "../configurations/mediasoupConfiguration";

export default class WorkerRepository {
  private readonly _workers: types.Worker[];
  private _currentWorkerIndex: number;

  private constructor(workers: types.Worker[]) {
    this._workers = workers;
    this._currentWorkerIndex = 0;
  }

  public static async create(): Promise<WorkerRepository> {
    const workers: types.Worker[] = [];

    for (let i = 0; i < mediasoupConfiguration.mediasoup.numWorkers; ++i) {
      const worker = await createWorker(mediasoupConfiguration.mediasoup.worker);

      worker.on("died", () => {
        setTimeout(() => process.exit(1), 2000);
      });

      workers.push(worker);
    }

    return new WorkerRepository(workers);
  }

  public get worker(): types.Worker {
    const worker = this._workers[this._currentWorkerIndex];

    this._currentWorkerIndex += 1;
    this._currentWorkerIndex %= this._workers.length;

    return worker;
  }
}