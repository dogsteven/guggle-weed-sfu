export default {
  server: {
    listenIp: "0.0.0.0",
    listenPort: process.env.PORT || 8200,
  },
  mediaBroker: {
    host: "http://localhost",
    port: process.env.MEDIA_BROKER_PORT || 8100,
  }
}