import path from "path";
import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as contactImportService from "../services/contactImport.service";
import { ValidationError } from "../errors/errors";

/**
 * `preview` stores the uploaded file on disk (via `uploadContactImport`
 * middleware) and parses it, returning only the first 10 rows as a sample
 * plus the full header list and a suggested column mapping. It also echoes
 * back the saved file's path (relative to the backend's working directory,
 * e.g. "uploads/imports/xxx.csv") so `confirm` can re-parse the exact same
 * file from disk without requiring the client to re-upload it.
 */
export const preview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError("Aucun fichier n'a été fourni");
  }

  // Extension first: browsers on Windows report both .csv and .xls files as
  // "application/vnd.ms-excel", so the mimetype can't tell them apart.
  const mimeOrExt = path.extname(req.file.originalname) || req.file.mimetype;
  const parsed = await contactImportService.parseFile(req.file.path, mimeOrExt);
  const suggestedMapping = contactImportService.suggestColumnMapping(parsed.headers);

  const relativeFilePath = path.relative(process.cwd(), req.file.path);

  res.status(200).json({
    filePath: relativeFilePath,
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 10),
    suggestedMapping,
  });
});

/**
 * `confirm` re-reads the same file from disk using the `filePath` returned
 * by `preview`, re-parses it, then applies `columnMapping` (and optional
 * `tagNames`) to actually persist contacts via `contactImport.service.importRows`.
 */
export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const { filePath, columnMapping, tagNames, groupByField } = req.body as {
    filePath?: string;
    columnMapping?: Record<string, string>;
    tagNames?: string[];
    groupByField?: string;
  };

  if (!filePath || typeof filePath !== "string") {
    throw new ValidationError("filePath est requis");
  }
  if (!columnMapping || typeof columnMapping !== "object") {
    throw new ValidationError("columnMapping est requis");
  }
  if (groupByField && !contactImportService.isGroupableField(groupByField)) {
    throw new ValidationError(`Champ de regroupement non autorisé: "${groupByField}"`);
  }

  const absoluteFilePath = path.resolve(process.cwd(), filePath);
  const uploadsRoot = path.resolve(process.cwd(), "uploads");

  if (!absoluteFilePath.startsWith(uploadsRoot)) {
    throw new ValidationError("Chemin de fichier invalide");
  }

  const mimeOrExt = path.extname(absoluteFilePath);
  const parsed = await contactImportService.parseFile(absoluteFilePath, mimeOrExt);

  const result = await contactImportService.importRows(
    req.user!.id,
    parsed.rows,
    columnMapping,
    tagNames,
    groupByField
  );

  res.status(200).json(result);
});
