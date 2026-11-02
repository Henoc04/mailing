import fs from "fs";
import type { Attachment, Template } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError } from "../errors/errors";
import { sanitizeTemplateHtml } from "../lib/sanitizeHtml";
import type { CreateTemplateInput, UpdateTemplateInput } from "../dto/template.dto";

export type TemplateDetail = Template & { attachments: Attachment[] };

export async function create(ownerId: string, input: CreateTemplateInput): Promise<Template> {
  return prisma.template.create({
    data: {
      ownerId,
      name: input.name,
      subject: input.subject,
      bodyHtml: sanitizeTemplateHtml(input.bodyHtml),
      bodyText: input.bodyText ?? null,
      isDraft: input.isDraft,
    },
  });
}

export async function update(ownerId: string, id: string, input: UpdateTemplateInput): Promise<Template> {
  const existing = await prisma.template.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Modèle introuvable");
  }

  const { bodyHtml, ...rest } = input;

  return prisma.template.update({
    where: { id },
    data: {
      ...rest,
      ...(bodyHtml !== undefined ? { bodyHtml: sanitizeTemplateHtml(bodyHtml) } : {}),
    },
  });
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const existing = await prisma.template.findFirst({ where: { id, ownerId }, include: { attachments: true } });
  if (!existing) {
    throw new NotFoundError("Modèle introuvable");
  }

  await prisma.template.delete({ where: { id } });

  await Promise.all(
    existing.attachments.map((attachment) =>
      fs.promises.unlink(attachment.storedPath).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") {
          throw err;
        }
      })
    )
  );
}

export async function list(ownerId: string): Promise<Template[]> {
  return prisma.template.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
}

export async function getById(ownerId: string, id: string): Promise<TemplateDetail> {
  const template = await prisma.template.findFirst({ where: { id, ownerId }, include: { attachments: true } });
  if (!template) {
    throw new NotFoundError("Modèle introuvable");
  }
  return template;
}

/** Clones a template, suffixing its name with " (copie)". */
export async function duplicate(ownerId: string, id: string): Promise<Template> {
  const existing = await getById(ownerId, id);

  return prisma.template.create({
    data: {
      ownerId,
      name: `${existing.name} (copie)`,
      subject: existing.subject,
      bodyHtml: existing.bodyHtml,
      bodyText: existing.bodyText,
      isDraft: existing.isDraft,
    },
  });
}
