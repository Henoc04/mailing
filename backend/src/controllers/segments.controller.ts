import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as segmentService from "../services/segment.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const segments = await segmentService.list(req.user!.id);
  res.status(200).json(segments);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const segment = await segmentService.getById(req.user!.id, req.params.id);
  res.status(200).json(segment);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const segment = await segmentService.create(req.user!.id, req.body);
  res.status(201).json(segment);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const segment = await segmentService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json(segment);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await segmentService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});
