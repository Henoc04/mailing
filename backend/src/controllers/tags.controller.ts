import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as tagService from "../services/tag.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const tags = await tagService.list(req.user!.id);
  res.status(200).json(tags);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const tag = await tagService.create(req.user!.id, req.body);
  res.status(201).json(tag);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await tagService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});
