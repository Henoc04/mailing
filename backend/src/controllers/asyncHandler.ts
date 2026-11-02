import type { NextFunction, Request, Response } from "express";

/**
 * Wraps an async Express handler so a rejected promise is forwarded to
 * `next(err)` instead of crashing the process. Express 4 does not await
 * handlers or catch async rejections on its own.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
