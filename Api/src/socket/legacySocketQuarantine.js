const { Server: SocketServer } = require("socket.io");

const QUARANTINE_UNAVAILABLE_EVENT =
  "LEGACY_SOCKET_QUARANTINE_UNAVAILABLE";

function createDefaultSocketServer(httpServer, options) {
  return new SocketServer(httpServer, options);
}

function attachLegacySocketQuarantine({
  httpServer,
  corsOrigins = [],
  createSocketServer = createDefaultSocketServer,
  logger = console,
}) {
  if (!httpServer) {
    throw new TypeError("httpServer is required");
  }

  let socketServer;

  try {
    socketServer = createSocketServer(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ["GET", "POST"],
      },
    });
  } catch {
    logger?.error?.(QUARANTINE_UNAVAILABLE_EVENT);

    return {
      enabled: false,
      close: async () => {},
    };
  }

  return {
    enabled: true,
    close: () =>
      new Promise((resolve) => {
        socketServer.close(resolve);
      }),
  };
}

module.exports = {
  QUARANTINE_UNAVAILABLE_EVENT,
  attachLegacySocketQuarantine,
};
