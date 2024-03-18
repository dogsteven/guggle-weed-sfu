import { types } from "mediasoup";
import { EventEmitter } from "stream";
import Attendee from "./attendee";
import mediasoupConfiguration from "../configurations/mediasoupConfiguration";
import { Result } from "./utils/result";

export default class Meeting extends EventEmitter<{
  attendeeLeft: [any]
}> {
  public readonly id: any;
  public readonly hostId: any;
  private readonly _router: types.Router;
  private readonly _attendees: Map<any, Attendee>;

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
}