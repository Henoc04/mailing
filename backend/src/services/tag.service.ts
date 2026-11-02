import type { Tag } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError } from "../errors/errors";

export interface CreateTagInput {
  name: string;
  color?: string | null;
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function create(ownerId: string, input: CreateTagInput): Promise<Tag> {
  try {
    return await prisma.tag.create({
      data: {
        ownerId,
        name: input.name,
        color: input.color ?? null,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("Un tag avec ce nom existe déjà");
    }
    throw err;
  }
}

export async function list(ownerId: string): Promise<Tag[]> {
  return prisma.tag.findMany({ where: { ownerId }, orderBy: { name: "asc" } });
}

export async function remove(ownerId: string, id: string): Promise<void> {
  // ContactTag rows cascade-delete automatically via the schema's
  // onDelete: Cascade on the Tag -> ContactTag relation.
  await prisma.tag.deleteMany({ where: { id, ownerId } });
}

/**
 * Used by the import flow's "segmentation" step (e.g. Prospects, Clients,
 * Recruteurs, RH, Partenaires, Étudiants, Autres). Upserts on the
 * (ownerId, name) unique constraint so re-importing with the same tag
 * names is idempotent.
 */
export async function findOrCreateMany(ownerId: string, names: string[]): Promise<Tag[]> {
  const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)));

  const tags: Tag[] = [];
  for (const name of uniqueNames) {
    const tag = await prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name } },
      update: {},
      create: { ownerId, name },
    });
    tags.push(tag);
  }

  return tags;
}
