import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as auditLogService from "../services/auditLog.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const actorId = typeof req.query.actorId === "string" ? req.query.actorId : undefined;
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;

  const result = await auditLogService.list({ actorId, entityType }, page, pageSize);
  res.status(200).json(result);
});
