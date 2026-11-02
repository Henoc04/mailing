import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as draftService from "../services/draft.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const drafts = await draftService.list(req.user!.id, type);
  res.status(200).json(drafts);
});
