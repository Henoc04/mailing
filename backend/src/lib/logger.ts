import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
});

export const httpLogger = pinoHttp({
  logger,
});
