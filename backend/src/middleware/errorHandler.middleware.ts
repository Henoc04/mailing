import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { MAX_UPLOAD_FILE_SIZE_BYTES } from "../config/constants";
import { AppError } from "../errors/AppError";
import { ValidationError } from "../errors/errors";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Upload problems (file too large, unsupported type) are caused by the
 * user's file, not the server — map them to a 400 with a readable message.
 */
function toUploadValidationError(err: unknown): ValidationError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new ValidationError(`Fichier trop volumineux (maximum ${MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024)} Mo)`);
    }
    return new ValidationError(`Envoi de fichier refusé : ${err.message}`);
  }
  if (err instanceof Error && /^Unsupported .* file type/.test(err.message)) {
    return new ValidationError(`Type de fichier non pris en charge : ${err.message.replace(/^Unsupported .* file type:\s*/, "")}`);
  }
  return null;
}

/**
 * Express error-handling middleware. Must be registered last, after all
 * routes, with the 4-arg signature so Express recognizes it as an error
 * handler.
 */
export function errorHandler(rawErr: unknown, req: Request, res: Response, _next: NextFunction): void {
  const err = toUploadValidationError(rawErr) ?? rawErr;

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      statusCode: err.statusCode,
      error: err.name,
      message: err.message,
    };

    if (err instanceof ValidationError && err.details !== undefined) {
      body.details = err.details;
    }

    if (env.NODE_ENV !== "production") {
      body.stack = err.stack;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  const error = err instanceof Error ? err : new Error("Unknown error");
  logger.error({ err: error, path: req.path, method: req.method }, "Unhandled error");

  const body: Record<string, unknown> = {
    statusCode: 500,
    error: "InternalServerError",
    message: "An unexpected error occurred",
  };

  if (env.NODE_ENV !== "production") {
    body.stack = error.stack;
  }

  res.status(500).json(body);
}
