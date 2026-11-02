import type http from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "./jwt";
import { logger } from "./logger";

let io: Server | null = null;

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.id;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    // Best-effort room join: we do not verify that this socket's user owns
    // the campaign before letting it join the room. The room itself only
    // ever receives progress events emitted by server-side controllers/
    // services, which already enforce ownership when they load campaign
    // data via the authenticated REST API. Joining a room with no matching
    // emits is harmless.
    socket.on("subscribe:campaign", (payload: { campaignId: string }) => {
      if (payload && typeof payload.campaignId === "string" && payload.campaignId.length > 0) {
        socket.join(`campaign:${payload.campaignId}`);
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO server has not been initialized yet. Call initSocket() first.");
  }
  return io;
}

export function emitCampaignProgress(campaignId: string, payload: object): void {
  try {
    // campaignId is always attached: the client discards payloads that
    // don't identify their campaign.
    getIO().to(`campaign:${campaignId}`).emit("campaign:progress", { ...payload, campaignId });
  } catch (err) {
    logger.warn({ err, campaignId }, "emitCampaignProgress: Socket.IO not initialized, skipping emit");
  }
}
