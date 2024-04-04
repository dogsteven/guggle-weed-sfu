import os from "os";
import { types as mediasoupTypes } from "mediasoup";
import dotenv from "dotenv";

dotenv.config();

export default {
  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10500,
      logLevel: "warn" as mediasoupTypes.WorkerLogLevel,
      logTags: [
        "info",
        "ice",
        "dtls",
        "rtp",
        "srtp",
        "rtcp",
        // "rtx",
        // "bwe",
        // "score",
        // "simulcast",
        // "svc"
      ] as mediasoupTypes.WorkerLogTag[]
    },
    router: {
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/VP9",
          clockRate: 90000,
          parameters: {
            "profile-id": 2,
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/h264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "4d0032",
            "level-asymmetry-allowed": 1,
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/h264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1,
            "x-google-start-bitrate": 1000,
          },
        },
      ],
    } as mediasoupTypes.RouterOptions,
    webRtcTransport: {
      listenInfos: [
        { protocol: "udp", ip: "0.0.0.0", announcedAddress: process.env.PUBLIC_IP },
        { protocol: "tcp", ip: "0.0.0.0", announcedAddress: process.env.PUBLIC_IP },
      ] as mediasoupTypes.TransportListenInfo[],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    }
  }
}