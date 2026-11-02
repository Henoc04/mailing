import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as contactService from "../services/contact.service";
import type { BulkTagActionInput, ListContactsQuery } from "../dto/contact.dto";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await contactService.list(req.user!.id, req.query as unknown as ListContactsQuery);
  res.status(200).json(result);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.getById(req.user!.id, req.params.id);
  res.status(200).json(contact);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.create(req.user!.id, req.body);
  res.status(201).json(contact);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const contact = await contactService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json(contact);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await contactService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});

export const setTags = asyncHandler(async (req: Request, res: Response) => {
  const tagIds = Array.isArray(req.body?.tagIds) ? (req.body.tagIds as string[]) : [];
  await contactService.setTags(req.user!.id, req.params.id, tagIds);
  res.status(200).json({ success: true });
});

export const bulkTag = asyncHandler(async (req: Request, res: Response) => {
  const result = await contactService.bulkSetTag(req.user!.id, req.body as BulkTagActionInput);
  res.status(200).json(result);
});
