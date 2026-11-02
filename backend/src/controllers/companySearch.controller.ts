import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as companySearchService from "../services/companySearch.service";

export const search = asyncHandler(async (req: Request, res: Response) => {
  const results = await companySearchService.searchCompanies(req.body);
  res.status(200).json(results);
});

export const guessEmail = asyncHandler(async (req: Request, res: Response) => {
  const { website } = req.body as { website: string };
  const result = await companySearchService.guessEmail(website);
  res.status(200).json(result);
});
