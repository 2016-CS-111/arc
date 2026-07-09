import type { Server as HttpServer } from "node:http";

import type { Logger } from "@arc/shared";
import { Server } from "socket.io";

export function registerRealtimeGateway(server: HttpServer, logger: Logger): Server {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    logger.info("Realtime client connected", { socketId: socket.id });

    socket.emit("server:ready", {
      status: "ok",
      timestamp: new Date().toISOString(),
    });

    socket.on("disconnect", (reason) => {
      logger.info("Realtime client disconnected", {
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
}
