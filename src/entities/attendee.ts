import EventEmitter from "events";
import { types } from "mediasoup";
import { Result } from "./utils/result";

export type TransportType = "send" | "receive";
export type ProducerType = "video" | "audio" | "screen-video" | "screen-audio";

type AttendeeEvents = {
  left: []
}

export default class Attendee extends EventEmitter<AttendeeEvents> {
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
      this.close(true);
    });

    Attendee.inititalizeTransport(this._receiveTransport, () => {
      this.close(true);
    });
  }

  private static inititalizeTransport(transport: types.WebRtcTransport, listener: () => void) {
    transport.once("routerclose", () => {
      listener();
    });

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

  public async connectTransport(transportType: TransportType, dtlsParameters: types.DtlsParameters): Promise<Result<any>> {
    try {
      const transport = transportType === "send" ? this._sendTransport : this._receiveTransport;

      await transport.connect({ dtlsParameters });

      return {
        status: "success",
        data: {}
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  private reserveProducerSlot(producerType: ProducerType): Result<any> {
    if (this._producers.has(producerType)) {
      return {
        status: "failed",
        message: `Producer of type ${producerType} already presents in this attendee`
      };
    }

    this._producers.set(producerType, null);

    return {
      status: "success",
      data: {}
    }
  }

  private returnProducerSlot(produceType: ProducerType) {
    if (this._producers.has(produceType)) {
      const reservation = this._producers.get(produceType);

      if (reservation == null) {
        this._producers.delete(produceType);
      }
    }
  }

  public async produceMedia(producerType: ProducerType, rtpParameters: types.RtpParameters): Promise<Result<types.Producer>> {
    try {
      const reservationResult = this.reserveProducerSlot(producerType);

      if (reservationResult.status === "failed") {
        return reservationResult;
      }

      const kind = Attendee.getMediaKind(producerType);

      const producer = await this._sendTransport.produce({
        kind, rtpParameters,
        appData: {
          producerType: producerType
        }
      });

      if (!producer) {
        this.returnProducerSlot(producerType);

        return {
          status: "failed",
          message: "An unexpected error ocurred during creating a producer"
        };
      }

      this._producers.set(producerType, producer);

      return {
        status: "success",
        data: producer
      };
    } catch (error) {
      this.returnProducerSlot(producerType);

      return {
        status: "failed",
        message: error
      };
    }
  }

  public async pauseProducer(producerType: ProducerType): Promise<Result<any>> {
    try {
      if (!this._producers.has(producerType)) {
        return {
          status: "failed",
          message: `There is no producer of type ${producerType} at the moment`
        };
      }

      const producer = this._producers.get(producerType);

      await producer.pause();

      return {
        status: "success",
        data: {}
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  public async resumeProducer(producerType: ProducerType): Promise<Result<any>> {
    try {
      if (!this._producers.has(producerType)) {
        return {
          status: "failed",
          message: `There is no producer of type ${producerType} at the moment`
        };
      }

      const producer = this._producers.get(producerType);

      await producer.resume();

      return {
        status: "success",
        data: {}
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }


  public closeProducer(producerType: ProducerType): Result<any> {
    if (!this._producers.has(producerType)) {
      return {
        status: "failed",
        message: `There is no producer of type ${producerType} at the moment`
      };
    }

    const producer = this._producers.get(producerType);
    
    producer.close();

    this._producers.delete(producerType);
  }

  public async consumeMedia(producerId: string, rtpCapabilities: types.RtpCapabilities): Promise<Result<types.Consumer>> {
    try {
      const consumer = await this._receiveTransport.consume({
        producerId, rtpCapabilities,
        paused: false
      });

      if (!consumer) {
        return {
          status: "failed",
          message: `Cannot create a consumer for producer with id ${producerId}`
        };
      }

      if (consumer.type === "simulcast" || consumer.type === "svc") {
        try {
          const { scalabilityMode } = consumer.rtpParameters.encodings[0];
          const spatialLayer = parseInt(scalabilityMode.substring(1, 2));
          const temporalLayer = parseInt(scalabilityMode.substring(3, 4));
          await consumer.setPreferredLayers({ spatialLayer, temporalLayer });
        } catch (error) {
          consumer.close();
          return {
            status: "failed",
            message: error
          };
        }
      }

      this._consumers.set(consumer.id, consumer);

      consumer.observer.once("close", () => {
        if (this._closed) {
          return;
        }

        this._consumers.delete(consumer.id);
      });

      return {
        status: "success",
        data: consumer
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  public async pauseConsumer(consumerId: string): Promise<Result<any>> {
    try {
      if (!this._consumers.has(consumerId)) {
        return {
          status: "failed",
          message: `There is no consumer with id ${consumerId} at the moment`
        };
      }

      const consumer = this._consumers.get(consumerId);

      await consumer.pause();

      return {
        status: "success",
        data: {}
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  public async resumeConsumer(consumerId: string): Promise<Result<any>> {
    try {
      if (!this._consumers.has(consumerId)) {
        return {
          status: "failed",
          message: `There is no consumer with id ${consumerId} at the moment`
        };
      }

      const consumer = this._consumers.get(consumerId);

      await consumer.resume();

      return {
        status: "success",
        data: {}
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  public close(leave: boolean = true) {
    if (this._closed) {
      return;
    }

    this._closed = true;

    this._sendTransport.close();
    this._receiveTransport.close();

    if (leave) {
      this.emit("left");
    }
  }
}