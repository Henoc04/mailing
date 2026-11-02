import type { NextFunction, Request, Response } from "express";
import { ForbiddenError } from "../errors/errors";
import { UnauthorizedError } from "../errors/errors";

/**
 * Higher-order middleware factory. Must be used after `requireAuth`, which
 * populates `req.user`.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError("You do not have permission to perform this action");
    }

    next();
  };
}
