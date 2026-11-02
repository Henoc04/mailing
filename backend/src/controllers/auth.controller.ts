import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as authService from "../services/auth.service";
import * as userService from "../services/user.service";
import { UnauthorizedError } from "../errors/errors";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  res.status(200).json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError("Authentication required");
  }

  const user = await userService.findById(req.user.id);
  const { passwordHash, ...safeUser } = user;

  res.status(200).json(safeUser);
});
