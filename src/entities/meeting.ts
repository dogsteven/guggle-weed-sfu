import { types } from "mediasoup";
import Attendee, { ProducerType, TransportType } from "./attendee";
import mediasoupConfiguration from "../configurations/mediasoupConfiguration";

export default class Meeting {
  public readonly id: any;
  private _ended: boolean;
  public readonly hostId: any;
  private readonly _router: types.Router;
  private readonly _attendees: Map<any, Attendee>;

  public get routerRtpCapabilities(): types.RtpCapabilities {
    return this._router.rtpCapabilities;
  }

  public get attendees(): { attendeeId: any, producerIds: string[] }[] {
    return Array.from(this._attendees.values()).map((attendee) => ({
      attendeeId: attendee.id,
      producerIds: attendee.producerIds
    }));
  }

  private constructor(id: any, hostId: any, router: types.Router) {
    this.id = id;
    this._ended = false;
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

  public end(): void {
    if (this._ended) {
      throw new Error(`This meeting has been ended`);
    }

    this._ended = true;

    for (const [_, attendee] of this._attendees) {
      attendee.close();
    }

    this._router.close();
  }

  
  /*
  BEGIN ATTENDEE SECTION
  */
  private async createWebRtcTransport(): Promise<types.WebRtcTransport> {
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate } = mediasoupConfiguration.mediasoup.webRtcTransport

    const transport = await this._router.createWebRtcTransport({
      listenInfos: mediasoupConfiguration.mediasoup.webRtcTransport.listenInfos,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      iceConsentTimeout: 20,
      initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate
    });

    if (!transport) {
      throw new Error(`Cannot create transport`);
    }

    if (maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
      } catch (error) {
        console.error(error);
      }
    }

    return transport;
  }

  private reserveAttendeeSlot(attendeeId: any): void {
    if (this._attendees.has(attendeeId)) {
      throw new Error(`Attendee with id ${attendeeId} has been joined this meeting`);
    }

    this._attendees.set(attendeeId, null);
  }

  private returnAttendeeSlot(attendeeId: any) {
    if (this._attendees.has(attendeeId)) {
      const reservation = this._attendees.get(attendeeId);

      if (reservation == null) {
        this._attendees.delete(attendeeId);
      }
    }
  }

  public async addAttendee(attendeeId: any): Promise<{ attendee: Attendee, sendTransport: types.WebRtcTransport, receiveTransport: types.WebRtcTransport }> {
    this.reserveAttendeeSlot(attendeeId);

    try {
      const sendTransport = await this.createWebRtcTransport();

      let receiveTransport: types.WebRtcTransport;

      try {
        receiveTransport = await this.createWebRtcTransport();
      } catch (error) {
        sendTransport.close();
        throw error;
      }

      const attendee = new Attendee(attendeeId, sendTransport, receiveTransport);

      this._attendees.set(attendeeId, attendee);

      attendee.once("error", () => {
        this._attendees.delete(attendeeId);
      });

      return { attendee, sendTransport, receiveTransport }
    } catch (error) {
      this.returnAttendeeSlot(attendeeId);
      throw error;
    }
  }

  public async connectTransport(attendeeId: any, transportType: TransportType, dtlsParameters: types.DtlsParameters): Promise<void> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    await attendee.connectTransport(transportType, dtlsParameters);
  }

  public removeAttendee(attendeeId: any): void {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    attendee.close();

    this._attendees.delete(attendeeId);
  }
  /*
  END ATTENDEE SECTION
  */

  /*
  BEGIN PRODUCER SECTION
  */
  public async produceMedia(attendeeId: any, producerType: ProducerType, rtpParameters: types.RtpParameters): Promise<types.Producer> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    return await attendee.produceMedia(producerType, rtpParameters);
  }

  public closeProducer(attendeeId: any, producerType: ProducerType): void {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    attendee.closeProducer(producerType);
  }

  public async pauseProducer(attendeeId: any, producerType: ProducerType): Promise<void> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    await attendee.pauseProducer(producerType);
  }

  public async resumeProducer(attendeeId: any, producerType: ProducerType): Promise<void> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    await attendee.resumeProducer(producerType);
  }
  /*
  END PRODUCER SECTION
  */

  /*
  BEGIN CONSUMER SECTION
  */
  public async consumeMedia(attendeeId: any, producerId: string, rtpCapabilities: types.RtpCapabilities): Promise<types.Consumer> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    return await attendee.consumeMedia(producerId, rtpCapabilities);
  }

  public closeConsumer(attendeeId: any, consumerId: string): void {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    attendee.closeConsumer(consumerId);
  }

  public async pauseConsumer(attendeeId: any, consumerId: string): Promise<void> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    await attendee.pauseConsumer(consumerId);
  }

  public async resumeConsumer(attendeeId: any, consumerId: string): Promise<void> {
    if (!this._attendees.has(attendeeId)) {
      throw new Error(`There is no attendee ${attendeeId} in this meeting at the moment`);
    }

    const attendee = this._attendees.get(attendeeId);

    await attendee.resumeConsumer(consumerId);
  }
  /*
  END CONSUMER SECTION
  */
}