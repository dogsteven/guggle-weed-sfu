import os from "os";
import { types as mediasoupTypes } from "mediasoup";

const networkInterfaces = os.networkInterfaces();

const getLocalIp = () => {
  let localIp = "127.0.0.1";
  let checkIp = true;

  Object.keys(networkInterfaces).forEach((name) => {
    for (const networkInterface of networkInterfaces[name]) {
      if (networkInterface.family !== "IPv4" || networkInterface.internal !== false || checkIp === false) {
        continue;
      }
      localIp = networkInterface.address
      checkIp = true;
      return;
    }
  });

  return localIp
}

export default {
  server: {
    listenIp: "0.0.0.0",
    listenPort: process.env.PORT || 8100,
  },

  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10200,
      logLevel: "warn" as mediasoupTypes.WorkerLogLevel,
      logTags: [
        "info",
        "ice",
        "dtls",
        "rtp",
        "srtp",
        "rtcp",
        "rtx",
        "bwe",
        "score",
        "simulcast",
        "svc"
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
        { protocol: "udp", ip: "0.0.0.0", announcedAddress: getLocalIp() },
        { protocol: "tcp", ip: "0.0.0.0", announcedAddress: getLocalIp() },
      ] as mediasoupTypes.TransportListenInfo[],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    }
  }
}