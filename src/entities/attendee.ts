import EventEmitter from "events";
import { types } from "mediasoup";

export type TransportType = "send" | "receive";
export type ProducerType = "video" | "audio" | "screen-video" | "screen-audio";

type AttendeeEvent = {
  error: []
}

export default class Attendee extends EventEmitter<AttendeeEvent> {
  public readonly id: any;
  private _closed: boolean;
  private readonly _sendTransport: types.WebRtcTransport;
  private readonly _receiveTransport: types.WebRtcTransport;
  private readonly _producers: Map<ProducerType, types.Producer>;
  private readonly _consumers: Map<string, types.Consumer>;

  public get producerIds(): string[] {
    return Array.from(this._producers.values()).map((producer) => producer.id);
  }

  public constructor(id: any, sendTransport: types.WebRtcTransport, receiveTransport: types.WebRtcTransport) {
    super();

    this.id = id;
    this._closed = false;
    this._sendTransport = sendTransport;
    this._receiveTransport = receiveTransport;
    this._producers = new Map<ProducerType, types.Producer>();
    this._consumers = new Map<string, types.Consumer>();

    Attendee.inititalizeTransport(this._sendTransport, () => {
      this.error();
    });

    Attendee.inititalizeTransport(this._receiveTransport, () => {
      this.error();
    });
  }

  private static inititalizeTransport(transport: types.WebRtcTransport, listener: () => void): void {
    transport.on("dtlsstatechange", (state) => {
      if (state === "failed" || state === "closed") {
        listener();
      }
    });

    transport.on("icestatechange", (state) => {
      if (state === "disconnected" || state === "closed") {
        listener();
      }
    });
  }

  private static getMediaKind(producerType: ProducerType): types.MediaKind {
    switch (producerType) {
      case "video":
        return "video";
      case "audio":
        return "audio";
      case "screen-video":
        return "video";
      case "screen-audio":
        return "audio";
    }
  }

  public async connectTransport(transportType: TransportType, dtlsParameters: types.DtlsParameters): Promise<void> {
    const transport = transportType === "send" ? this._sendTransport : this._receiveTransport;

    await transport.connect({ dtlsParameters });
  }

  private reserveProducerSlot(producerType: ProducerType): void {
    if (this._producers.has(producerType)) {
      throw new Error(`Producer of type ${producerType} already presents in this attendee`);
    }

    this._producers.set(producerType, null);
  }

  private returnProducerSlot(produceType: ProducerType): void {
    if (this._producers.has(produceType)) {
      const reservation = this._producers.get(produceType);

      if (reservation == null) {
        this._producers.delete(produceType);
      }
    }
  }

  public async produceMedia(producerType: ProducerType, rtpParameters: types.RtpParameters): Promise<types.Producer> {
    this.reserveProducerSlot(producerType);
    
    try {
      const kind = Attendee.getMediaKind(producerType);

      const producer = await this._sendTransport.produce({
        kind, rtpParameters,
        appData: {
          producerType: producerType
        }
      });

      if (!producer) {
        throw new Error("An unexpected error ocurred during creating a producer");
      }

      this._producers.set(producerType, producer);

      return producer;
    } catch (error) {
      this.returnProducerSlot(producerType);
      throw error;
    }
  }

  public closeProducer(producerType: ProducerType): void {
    if (!this._producers.has(producerType)) {
      throw new Error(`There is no producer of type ${producerType} at the moment`);
    }

    const producer = this._producers.get(producerType);
    
    producer.close();

    this._producers.delete(producerType);
  }

  public async pauseProducer(producerType: ProducerType): Promise<void> {
    if (!this._producers.has(producerType)) {
      throw new Error(`There is no producer of type ${producerType} at the moment`);
    }

    const producer = this._producers.get(producerType);

    if (producer.paused) {
      throw new Error(`This producer is already paused`);
    }

    await producer.pause();
  }

  public async resumeProducer(producerType: ProducerType): Promise<void> {
    if (!this._producers.has(producerType)) {
      throw new Error(`There is no producer of type ${producerType} at the moment`);
    }

    const producer = this._producers.get(producerType);

    if (!producer.paused) {
      throw new Error(`This producer is not paused yet`);
    }

    await producer.resume();
  }

  public async consumeMedia(producerId: string, rtpCapabilities: types.RtpCapabilities): Promise<types.Consumer> {
    const consumer = await this._receiveTransport.consume({
      producerId, rtpCapabilities,
      paused: false
    });

    if (!consumer) {
      throw new Error(`Cannot create a consumer for producer with id ${producerId}`);
    }

    if (consumer.type === "simulcast" || consumer.type === "svc") {
      try {
        const { scalabilityMode } = consumer.rtpParameters.encodings[0];
        const spatialLayer = parseInt(scalabilityMode.substring(1, 2));
        const temporalLayer = parseInt(scalabilityMode.substring(3, 4));
        await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
      } catch (error) {
        consumer.close();
        throw error;
      }
    }

    this._consumers.set(consumer.id, consumer);

    consumer.observer.once("close", () => {
      if (this._closed) {
        return;
      }

      this._consumers.delete(consumer.id);
    });

    return consumer;
  }

  public closeConsumer(consumerId: string): void {
    if (!this._consumers.has(consumerId)) {
      throw new Error(`There is no consumer with id ${consumerId} at the moment`);
    }

    const consumer = this._consumers.get(consumerId);

    consumer.close();
  }

  public async pauseConsumer(consumerId: string): Promise<void> {
    if (!this._consumers.has(consumerId)) {
      throw new Error(`There is no consumer with id ${consumerId} at the moment`);
    }

    const consumer = this._consumers.get(consumerId);

    await consumer.pause();
  }

  public async resumeConsumer(consumerId: string): Promise<void> {
    if (!this._consumers.has(consumerId)) {
      throw new Error(`There is no consumer with id ${consumerId} at the moment`);
    }

    const consumer = this._consumers.get(consumerId);

    await consumer.resume();
  }

  private error(): void {
    if (this._closed) {
      return;
    }

    this._closed = true;

    this._sendTransport.close();
    this._receiveTransport.close();

    this.emit("error");
  }

  public close(): void {
    if (this._closed) {
      return;
    }

    this._closed = true;

    this._sendTransport.close();
    this._receiveTransport.close();
  }
}