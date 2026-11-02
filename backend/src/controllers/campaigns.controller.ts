import fs from "fs";
import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as campaignService from "../services/campaign.service";
import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../errors/errors";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const campaigns = await campaignService.list(req.user!.id);
  res.status(200).json(campaigns);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.getById(req.user!.id, req.params.id);
  res.status(200).json(campaign);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.create(req.user!.id, req.body);
  res.status(201).json(campaign);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.update(req.user!.id, req.params.id, req.body);
  res.status(200).json(campaign);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await campaignService.remove(req.user!.id, req.params.id);
  res.status(204).send();
});

export const duplicate = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.duplicate(req.user!.id, req.params.id);
  res.status(201).json(campaign);
});

export const resolveRecipients = asyncHandler(async (req: Request, res: Response) => {
  const result = await campaignService.resolveRecipients(req.user!.id, req.params.id);
  res.status(200).json(result);
});

export const previewRecipients = asyncHandler(async (req: Request, res: Response) => {
  const result = await campaignService.previewRecipients(req.user!.id, req.body);
  res.status(200).json(result);
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  const { contactId } = req.body as { contactId?: string };
  if (!contactId) {
    throw new ValidationError("contactId est requis");
  }

  const result = await campaignService.previewForContact(req.user!.id, req.params.id, contactId);
  res.status(200).json(result);
});

export const uploadAttachments = asyncHandler(async (req: Request, res: Response) => {
  // Ownership check — throws NotFoundError if the campaign isn't owned by req.user.
  await campaignService.getById(req.user!.id, req.params.id);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw new ValidationError("Aucun fichier n'a été fourni");
  }

  const attachments = await Promise.all(
    files.map((file) =>
      prisma.attachment.create({
        data: {
          campaignId: req.params.id,
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
  // Ownership check — throws NotFoundError if the campaign isn't owned by req.user.
  await campaignService.getById(req.user!.id, req.params.id);

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, campaignId: req.params.id },
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
