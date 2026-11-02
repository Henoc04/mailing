import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as smtpAccountService from "../services/smtpAccount.service";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const accounts = await smtpAccountService.list(req.user!.id);
  res.status(200).json(accounts);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const account = await smtpAccountService.getById(req.user!.id, req.params.id);
  res.status(200).json(account);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const account = await smtpAccountService.create(req.user!.id, req.body);
  res.status(201).json(account);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const account = await smtpAccountService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json(account);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await smtpAccountService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});

export const testConnection = asyncHandler(async (req: Request, res: Response) => {
  const result = await smtpAccountService.testConnection(req.user!.id, req.params.id);
  res.status(200).json(result);
});
