import type { Prisma, Segment } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../errors/errors";
import type { CreateSegmentInput, SegmentFilterRule, UpdateSegmentInput } from "../dto/segment.dto";

export async function create(ownerId: string, input: CreateSegmentInput): Promise<Segment> {
  return prisma.segment.create({
    data: {
      ownerId,
      name: input.name,
      description: input.description ?? null,
      filterMode: input.filterMode,
      filterJson: input.filterJson as Prisma.InputJsonValue,
    },
  });
}

export async function update(ownerId: string, id: string, input: UpdateSegmentInput): Promise<Segment> {
  const existing = await prisma.segment.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Segment introuvable");
  }

  const { filterJson, ...rest } = input;

  return prisma.segment.update({
    where: { id },
    data: {
      ...rest,
      ...(filterJson ? { filterJson: filterJson as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const existing = await prisma.segment.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Segment introuvable");
  }
  await prisma.segment.delete({ where: { id } });
}

export async function list(ownerId: string): Promise<Segment[]> {
  return prisma.segment.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
}

export async function getById(ownerId: string, id: string): Promise<Segment> {
  const segment = await prisma.segment.findFirst({ where: { id, ownerId } });
  if (!segment) {
    throw new NotFoundError("Segment introuvable");
  }
  return segment;
}

// ---- Security-sensitive filter compilation ----
//
// SECURITY: filterJson comes from end-user input (via CreateSegmentInput /
// UpdateSegmentInput). We must NEVER string-concatenate it into raw SQL and
// NEVER pass it to $queryRaw. Instead we translate it into a Prisma
// `ContactWhereInput` using a strict allow-list of both fields and
// operators below. Any field/operator outside the allow-list throws a
// ValidationError instead of silently being ignored or, worse, executed.

const ALLOWED_FIELDS = [
  "prenom",
  "nom",
  "genre",
  "email",
  "entreprise",
  "fonction",
  "adresse",
  "codePostal",
  "ville",
  "departement",
  "region",
  "pays",
  "siteWeb",
  "tagIds",
  "isUnsubscribed",
] as const;

const GENRE_VALUES = ["HOMME", "FEMME", "AUTRE"] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

const ALLOWED_OPERATORS = ["eq", "contains", "in", "notEq"] as const;

type AllowedOperator = (typeof ALLOWED_OPERATORS)[number];

function isAllowedField(field: string): field is AllowedField {
  return (ALLOWED_FIELDS as readonly string[]).includes(field);
}

function isAllowedOperator(operator: string): operator is AllowedOperator {
  return (ALLOWED_OPERATORS as readonly string[]).includes(operator);
}

function compileRule(rule: SegmentFilterRule): Prisma.ContactWhereInput {
  const { field, operator, value } = rule;

  if (!isAllowedField(field)) {
    throw new ValidationError(`Champ de segment non autorisé: "${field}"`);
  }
  if (!isAllowedOperator(operator)) {
    throw new ValidationError(`Opérateur de segment non autorisé: "${operator}"`);
  }

  // Special-cased field: tagIds only supports "in" and targets the
  // ContactTag join relation, not a scalar Contact column.
  if (field === "tagIds") {
    if (operator !== "in") {
      throw new ValidationError('Le champ "tagIds" ne supporte que l\'opérateur "in"');
    }
    if (!Array.isArray(value)) {
      throw new ValidationError('La valeur de "tagIds" doit être un tableau');
    }
    return { tags: { some: { tagId: { in: value as string[] } } } };
  }

  if (field === "isUnsubscribed") {
    if (operator === "eq") {
      return { isUnsubscribed: { equals: Boolean(value) } };
    }
    if (operator === "notEq") {
      return { isUnsubscribed: { not: Boolean(value) } };
    }
    throw new ValidationError('Le champ "isUnsubscribed" ne supporte que "eq" ou "notEq"');
  }

  // Special-cased field: "genre" is a MySQL/Prisma enum column, which only
  // supports equals/not/in (never "contains") — reject anything else and
  // validate the value(s) against the Genre enum before querying.
  if (field === "genre") {
    const isValidGenre = (v: unknown): v is (typeof GENRE_VALUES)[number] =>
      typeof v === "string" && (GENRE_VALUES as readonly string[]).includes(v);

    if (operator === "eq" || operator === "notEq") {
      if (!isValidGenre(value)) {
        throw new ValidationError(`Valeur de genre invalide: "${String(value)}"`);
      }
      return operator === "eq" ? { genre: { equals: value } } : { genre: { not: value } };
    }
    if (operator === "in") {
      if (!Array.isArray(value) || !value.every(isValidGenre)) {
        throw new ValidationError('La valeur de "genre" doit être un tableau de genres valides');
      }
      return { genre: { in: value } };
    }
    throw new ValidationError('Le champ "genre" ne supporte que "eq", "notEq" ou "in"');
  }

  // Remaining allow-listed fields are all plain string Contact columns.
  switch (operator) {
    case "eq":
      return { [field]: { equals: value } } as Prisma.ContactWhereInput;
    case "notEq":
      return { [field]: { not: value } } as Prisma.ContactWhereInput;
    case "contains":
      return { [field]: { contains: value, mode: "insensitive" } } as Prisma.ContactWhereInput;
    case "in":
      return { [field]: { in: value } } as Prisma.ContactWhereInput;
    default:
      // Unreachable due to isAllowedOperator guard above.
      throw new ValidationError(`Opérateur de segment non autorisé: "${operator}"`);
  }
}

/**
 * Compiles a segment's filter rules into a Prisma `ContactWhereInput`,
 * always scoping the result to `ownerId`. This is the only place segment
 * filters are turned into a Prisma query — never build raw SQL from
 * `filterJson` anywhere else.
 */
export function compileFilterToWhere(
  ownerId: string,
  filterMode: "AND" | "OR",
  filterJson: SegmentFilterRule[]
): Prisma.ContactWhereInput {
  const ruleWheres = filterJson.map(compileRule);

  const combined: Prisma.ContactWhereInput = filterMode === "AND" ? { AND: ruleWheres } : { OR: ruleWheres };

  return { AND: [{ ownerId }, combined] };
}

/**
 * Resolves the union of contact ids across one or more segments.
 *
 * Assumption: a campaign targeting multiple segments should reach every
 * contact that belongs to ANY of the given segments (the union of their
 * members), not only contacts that belong to all of them (the
 * intersection). Each segment's own filterMode (AND/OR) still governs how
 * that individual segment's rules combine.
 */
export async function resolveContactIds(ownerId: string, segmentIds: string[]): Promise<string[]> {
  const segments = await prisma.segment.findMany({ where: { id: { in: segmentIds }, ownerId } });

  const idSet = new Set<string>();

  for (const segment of segments) {
    const where = compileFilterToWhere(
      ownerId,
      segment.filterMode,
      segment.filterJson as unknown as SegmentFilterRule[]
    );
    const contacts = await prisma.contact.findMany({ where, select: { id: true } });
    for (const contact of contacts) {
      idSet.add(contact.id);
    }
  }

  return Array.from(idSet);
}
