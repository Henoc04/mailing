import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as dashboardService from "../services/dashboard.service";

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await dashboardService.getSummary(req.user!.id);
  res.status(200).json(result);
});
