import fs from "fs";
import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as templateService from "../services/template.service";
import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../errors/errors";
import { env } from "../config/env";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const templates = await templateService.list(req.user!.id);
  res.status(200).json(templates);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const template = await templateService.getById(req.user!.id, req.params.id);
  res.status(200).json(template);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const template = await templateService.create(req.user!.id, req.body);
  res.status(201).json(template);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const template = await templateService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json(template);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await templateService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});

export const duplicate = asyncHandler(async (req: Request, res: Response) => {
  const template = await templateService.duplicate(req.user!.id, req.params.id);
  res.status(201).json(template);
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new ValidationError("Aucune image n'a été fournie");
  }
  res.status(201).json({ url: `${env.PUBLIC_BASE_URL}/api/template-images/${file.filename}` });
});

export const uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
  // Ownership check — throws NotFoundError if the template isn't owned by req.user.
  await templateService.getById(req.user!.id, req.params.id);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new ValidationError("Aucun fichier n'a été fourni");
  }

  const attachments = await Promise.all(
    files.map((file) =>
      prisma.attachment.create({
        data: {
          templateId: req.params.id,
          fileName: file.originalname,
          storedPath: file.path,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      })
    )
  );

  res.status(201).json(attachments);
});

export const removeAttachment = asyncHandler(async (req: Request, res: Response) => {
  // Ownership check — throws NotFoundError if the template isn't owned by req.user.
  await templateService.getById(req.user!.id, req.params.id);

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, templateId: req.params.id },
  });

  if (!attachment) {
    throw new NotFoundError("Pièce jointe introuvable");
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });

  await fs.promises.unlink(attachment.storedPath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") {
      throw err;
    }
  });

  res.status(204).send();
});
