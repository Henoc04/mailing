import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "../errors/errors";

export type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodSchema, part: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      throw new ValidationError("Invalid request", result.error.issues);
    }

    req[part] = result.data;
    next();
  };
}
