import type { Logger } from "@arc/shared";
import { Inject } from "@nestjs/common";
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayDisconnect } from "@nestjs/websockets";
import type { Socket } from "socket.io";

import { ARC_LOGGER } from "../logger/logger.constants.js";

@WebSocketGateway({
  cors: {
    origin: "*",
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  public constructor(@Inject(ARC_LOGGER) private readonly logger: Logger) {}

  public handleConnection(client: Socket): void {
    this.logger.info("Realtime client connected", { socketId: client.id });

    client.emit("server:ready", {
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  public handleDisconnect(client: Socket): void {
    this.logger.info("Realtime client disconnected", {
      socketId: client.id,
    });
  }
}
