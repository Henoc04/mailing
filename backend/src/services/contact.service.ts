import type { Contact, Prisma, Tag } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "../errors/errors";
import type {
  BulkTagActionInput,
  ContactFilter,
  CreateContactInput,
  ListContactsQuery,
  UpdateContactInput,
} from "../dto/contact.dto";

export type ContactWithTags = Contact & { tags: Tag[] };

/** Flattens the `ContactTag` join rows returned by Prisma into a plain `tags: Tag[]`. */
export function withFlattenedTags<T extends { tags: { tag: Tag }[] }>(contact: T): Omit<T, "tags"> & { tags: Tag[] } {
  const { tags, ...rest } = contact;
  return { ...rest, tags: tags.map((t) => t.tag) };
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function create(ownerId: string, input: CreateContactInput): Promise<Contact> {
  const { tagIds, ...rest } = input;

  try {
    return await prisma.contact.create({
      data: {
        ownerId,
        prenom: rest.prenom ?? null,
        nom: rest.nom,
        genre: rest.genre ?? null,
        email: rest.email,
        entreprise: rest.entreprise ?? null,
        fonction: rest.fonction ?? null,
        telephone: rest.telephone ?? null,
        adresse: rest.adresse ?? null,
        codePostal: rest.codePostal ?? null,
        ville: rest.ville ?? null,
        departement: rest.departement ?? null,
        region: rest.region ?? null,
        pays: rest.pays ?? null,
        siteWeb: rest.siteWeb ?? null,
        notes: rest.notes ?? null,
        isUnsubscribed: rest.isUnsubscribed,
        ...(tagIds && tagIds.length > 0
          ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("Un contact avec cet email existe déjà");
    }
    throw err;
  }
}

export async function update(ownerId: string, id: string, input: UpdateContactInput): Promise<Contact> {
  const existing = await prisma.contact.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Contact introuvable");
  }

  const { tagIds, ...rest } = input;

  try {
    return await prisma.contact.update({
      where: { id },
      data: {
        ...rest,
        ...(tagIds
          ? {
              tags: {
                deleteMany: {},
                create: tagIds.map((tagId) => ({ tagId })),
              },
            }
          : {}),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("Un contact avec cet email existe déjà");
    }
    throw err;
  }
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const existing = await prisma.contact.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Contact introuvable");
  }

  await prisma.contact.delete({ where: { id } });
}

export async function getById(ownerId: string, id: string): Promise<ContactWithTags> {
  const contact = await prisma.contact.findFirst({
    where: { id, ownerId },
    include: { tags: { include: { tag: true } } },
  });

  if (!contact) {
    throw new NotFoundError("Contact introuvable");
  }

  return withFlattenedTags(contact);
}

export interface ListContactsResult {
  items: ContactWithTags[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Lists contacts for an owner with free-text search, single-tag filter,
 * sorting and pagination, matching `listContactsQuerySchema` in
 * `dto/contact.dto.ts` exactly (fields: page, pageSize, search, sortBy,
 * sortDir, tagId, isUnsubscribed).
 */
/**
 * Shared filter-to-where builder, used both by `list()` (paginated) and by
 * bulk actions that need "every contact matching this filter", not just the
 * current page.
 */
function buildContactWhere(ownerId: string, filter: ContactFilter): Prisma.ContactWhereInput {
  const { search, tagId, isUnsubscribed } = filter;

  return {
    ownerId,
    ...(typeof isUnsubscribed === "boolean" ? { isUnsubscribed } : {}),
    ...(tagId ? { tags: { some: { tagId } } } : {}),
    ...(search
      ? {
          OR: [
            { prenom: { contains: search } },
            { nom: { contains: search } },
            { email: { contains: search } },
            { entreprise: { contains: search } },
          ],
        }
      : {}),
  };
}

export async function list(ownerId: string, query: ListContactsQuery): Promise<ListContactsResult> {
  const { page, pageSize, sortBy, sortDir } = query;

  const where = buildContactWhere(ownerId, query);
  const orderBy: Prisma.ContactOrderByWithRelationInput = { [sortBy]: sortDir };

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    items: items.map(withFlattenedTags),
    total,
    page,
    pageSize,
  };
}

/**
 * Replaces a contact's tag associations transactionally. Verifies the
 * contact and every tagId belong to `ownerId` before mutating anything.
 */
export async function setTags(ownerId: string, contactId: string, tagIds: string[]): Promise<void> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, ownerId } });
  if (!contact) {
    throw new NotFoundError("Contact introuvable");
  }

  if (tagIds.length > 0) {
    const ownedTagCount = await prisma.tag.count({ where: { id: { in: tagIds }, ownerId } });
    if (ownedTagCount !== tagIds.length) {
      throw new NotFoundError("Un ou plusieurs tags sont introuvables");
    }
  }

  await prisma.$transaction([
    prisma.contactTag.deleteMany({ where: { contactId } }),
    ...(tagIds.length > 0
      ? [
          prisma.contactTag.createMany({
            data: tagIds.map((tagId) => ({ contactId, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

/** Resolves every contact id matching a filter, unpaginated — used by bulk actions. */
async function resolveIdsByFilter(ownerId: string, filter: ContactFilter): Promise<string[]> {
  const where = buildContactWhere(ownerId, filter);
  const contacts = await prisma.contact.findMany({ where, select: { id: true } });
  return contacts.map((c) => c.id);
}

export interface BulkSetTagResult {
  updated: number;
}

/**
 * Adds or removes a single tag across many contacts at once — either an
 * explicit `contactIds` list, or every contact matching `filter`
 * (unpaginated), so a group can be assigned to e.g. "every contact matching
 * the current search" without the caller having to know every id up front.
 * Unlike `setTags`, this never touches a contact's OTHER tag associations.
 */
export async function bulkSetTag(ownerId: string, input: BulkTagActionInput): Promise<BulkSetTagResult> {
  const { tagId, action, contactIds, filter } = input;

  const tag = await prisma.tag.findFirst({ where: { id: tagId, ownerId } });
  if (!tag) {
    throw new NotFoundError("Groupe (tag) introuvable");
  }

  let targetIds: string[];
  if (contactIds && contactIds.length > 0) {
    const owned = await prisma.contact.findMany({
      where: { id: { in: contactIds }, ownerId },
      select: { id: true },
    });
    targetIds = owned.map((c) => c.id);
  } else if (filter) {
    targetIds = await resolveIdsByFilter(ownerId, filter);
  } else {
    throw new ValidationError("Aucun contact ciblé (contactIds ou filter requis)");
  }

  if (targetIds.length === 0) {
    return { updated: 0 };
  }

  if (action === "add") {
    await prisma.contactTag.createMany({
      data: targetIds.map((contactId) => ({ contactId, tagId })),
      skipDuplicates: true,
    });
  } else {
    await prisma.contactTag.deleteMany({ where: { tagId, contactId: { in: targetIds } } });
  }

  return { updated: targetIds.length };
}

export interface BulkCreateResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

/**
 * Used by the CSV/Excel import pipeline. Skips (does not throw on)
 * duplicate (ownerId, email) contacts and collects per-row errors without
 * aborting the whole batch.
 */
export async function bulkCreate(ownerId: string, contacts: CreateContactInput[]): Promise<BulkCreateResult> {
  let created = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      await create(ownerId, contact);
      created += 1;
    } catch (err) {
      if (err instanceof ConflictError) {
        skipped += 1;
        continue;
      }
      const message = err instanceof Error ? err.message : "Erreur inconnue lors de la création du contact";
      errors.push({ row: i, message });
    }
  }

  return { created, skipped, errors };
}
