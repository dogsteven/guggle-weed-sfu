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
  listenIp: "0.0.0.0",
  listenPort: 8200,

  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
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
          channels: 2
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000
          }
        }
      ] as mediasoupTypes.RtpCodecCapability[]
    },
    webRtcTransport: {
      listenIps: [
        {
          ip: "0.0.0.0",
          announcedIp: getLocalIp()
        }
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000
    }
  }
}