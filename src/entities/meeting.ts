import { types } from "mediasoup";
import { EventEmitter } from "stream";
import Attendee, { ProducerType, TransportType } from "./attendee";
import mediasoupConfiguration from "../configurations/mediasoupConfiguration";
import { Result } from "./utils/result";

type MeetingEvents = {
  attendeeLeft: [any]
}

export default class Meeting extends EventEmitter<MeetingEvents> {
  public readonly id: any;
  public readonly hostId: any;
  private readonly _router: types.Router;
  private readonly _attendees: Map<any, Attendee>;

  public get routerRtpCapabilities(): types.RtpCapabilities {
    return this._router.rtpCapabilities;
  }

  public get producerIds(): string[] {
    return Array.from(this._attendees.values()).flatMap((attendee) => attendee.producerIds);
  }

  private constructor(id: any, hostId: any, router: types.Router) {
    super();

    this.id = id;
    this.hostId = hostId;
    this._router = router;
    this._attendees = new Map<any, Attendee>();

    this._router.on("workerclose", () => {
      this.end();
    });
  }

  public static async create(id: any, hostId: any, worker: types.Worker): Promise<Meeting> {
    const router = await worker.createRouter(mediasoupConfiguration.mediasoup.router);

    return new Meeting(id, hostId, router);
  }

  public end() {
    for (const [_, attendee] of this._attendees) {
      attendee.close(false);
    }

    this._router.close();
  }

  
  /*
  BEGIN ATTENDEE SECTION
  */
  private async createWebRtcTransport(): Promise<Result<types.WebRtcTransport>> {
    try {
      const { maxIncomingBitrate, initialAvailableOutgoingBitrate } = mediasoupConfiguration.mediasoup.webRtcTransport

      const transport = await this._router.createWebRtcTransport({
        listenIps: mediasoupConfiguration.mediasoup.webRtcTransport.listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate
      });

      if (!transport) {
        return {
          status: "failed",
          message: `Cannot create transport`
        };
      }

      if (maxIncomingBitrate) {
        try {
          await transport.setMaxIncomingBitrate(maxIncomingBitrate);
        } catch (error) {
          console.error(error);
        }
      }

      return {
        status: "success",
        data: transport
      };
    } catch (error) {
      return {
        status: "failed",
        message: error
      };
    }
  }

  private reserveAttendeeSlot(attendeeId: any): Result<any> {
    if (this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `Attendee with id ${attendeeId} has been joined this meeting`
      };
    }

    this._attendees.set(attendeeId, null);

    return {
      status: "success",
      data: {}
    };
  }

  private returnAttendeeSlot(attendeeId: any) {
    if (this._attendees.has(attendeeId)) {
      const reservation = this._attendees.get(attendeeId);

      if (reservation == null) {
        this._attendees.delete(attendeeId);
      }
    }
  }

  public async addAttendee(attendeeId: any): Promise<Result<{ sendTransport: types.WebRtcTransport, receiveTransport: types.WebRtcTransport }>> {
    try {
      const reservationResult = this.reserveAttendeeSlot(attendeeId);

      if (reservationResult.status === "failed") {
        return reservationResult;
      }

      const sendTransportResult = await this.createWebRtcTransport();

      if (sendTransportResult.status === "failed") {
        this.returnAttendeeSlot(attendeeId);

        return sendTransportResult;
      }

      const receiveTransportResult = await this.createWebRtcTransport();

      if (receiveTransportResult.status === "failed") {
        this.returnAttendeeSlot(attendeeId);

        return receiveTransportResult;
      }

      const sendTransport = sendTransportResult.data;
      const receiveTransport = receiveTransportResult.data;

      const attendee = new Attendee(attendeeId, sendTransport, receiveTransport);

      attendee.once("left", () => {
        this.emit("attendeeLeft", attendeeId);
      });

      this._attendees.set(attendeeId, attendee);

      return {
        status: "success",
        data: {
          sendTransport, receiveTransport
        }
      };
    } catch (error) {
      this.returnAttendeeSlot(attendeeId);
      
      return {
        status: "failed",
        message: error
      };
    }
  }

  public async connectTransport(attendeeId: any, transportType: TransportType, dtlsParameters: types.DtlsParameters): Promise<Result<any>> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return await attendee.connectTransport(transportType, dtlsParameters);
  }

  public removeAttendee(attendeeId: any): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    this._attendees.delete(attendeeId);

    attendee.close(true);

    return {
      status: "success",
      data: {}
    };
  }
  /*
  END ATTENDEE SECTION
  */

  /*
  BEGIN PRODUCER SECTION
  */
  public async produceMedia(attendeeId: any, producerType: ProducerType, rtpParameters: types.RtpParameters): Promise<Result<types.Producer>> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return await attendee.produceMedia(producerType, rtpParameters);
  }

  public pauseProducer(attendeeId: any, producerType: ProducerType): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return attendee.pauseProducer(producerType);
  }

  public resumeProducer(attendeeId: any, producerType: ProducerType): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return attendee.resumeProducer(producerType);
  }

  public closeProducer(attendeeId: any, producerType: ProducerType): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return attendee.closeProducer(producerType);
  }
  /*
  END PRODUCER SECTION
  */

  /*
  BEGIN CONSUMER SECTION
  */
  public async consumeMedia(attendeeId: any, producerId: string, rtpCapabilities: types.RtpCapabilities): Promise<Result<types.Consumer>> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return await attendee.consumeMedia(producerId, rtpCapabilities);
  }

  public pauseConsumer(attendeeId: any, consumerId: string): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return attendee.pauseConsumer(consumerId);
  }

  public resumeConsumer(attendeeId: any, consumerId: string): Result<any> {
    if (!this._attendees.has(attendeeId)) {
      return {
        status: "failed",
        message: `There is no attendee ${attendeeId} in this meeting at the moment`
      };
    }

    const attendee = this._attendees.get(attendeeId);

    return attendee.resumeConsumer(consumerId);
  }
  /*
  END CONSUMER SECTION
  */
}