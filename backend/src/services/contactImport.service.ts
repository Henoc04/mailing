import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import type { CreateContactInput } from "../dto/contact.dto";
import * as contactService from "./contact.service";
import * as tagService from "./tag.service";
import type { BulkCreateResult } from "./contact.service";
import { ValidationError } from "../errors/errors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Reads a CSV/TXT or XLSX/XLS file from disk and returns its raw headers and
 * rows as strings, so the caller can map columns to Contact fields before
 * persisting anything.
 */
export async function parseFile(filePath: string, mimeOrExt: string): Promise<ParsedFile> {
  const normalized = mimeOrExt.toLowerCase();
  const isExcel =
    normalized.includes("xlsx") ||
    normalized.includes("xls") ||
    normalized.includes("spreadsheetml") ||
    normalized === ".xls" ||
    normalized === ".xlsx";

  try {
    return isExcel ? parseExcelFile(filePath) : parseCsvFile(filePath);
  } catch (err) {
    // Malformed files (unbalanced quotes, corrupt workbook...) are a user
    // input problem, not a server fault — surface the reason as a 400.
    const reason = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Impossible de lire le fichier : ${reason}`);
  }
}

function parseExcelFile(filePath: string): ParsedFile {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const records: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const rows = records.map((record) => stringifyRecord(record));

  return { headers, rows };
}

/**
 * Decodes a CSV/TXT file buffer as text, detecting and correcting for
 * non-UTF-8 source encodings (very common for French CSV exports from
 * Excel on Windows, which default to Windows-1252/ISO-8859-1). Decoding
 * such a file as UTF-8 silently corrupts every accented character into the
 * U+FFFD replacement character ("Yaté" -> "Yat�"), which then also
 * breaks header auto-detection for accented column names like "Département"
 * or "Région" (the corrupted header no longer matches any known variant).
 *
 * Heuristic: decode as UTF-8 first; if the result contains the replacement
 * character, the source was not valid UTF-8 — re-decode the same bytes as
 * "latin1" instead, which maps each byte 1:1 to the matching Unicode code
 * point and correctly restores French accented characters in the vast
 * majority of real-world Windows-1252/ISO-8859-1 files.
 */
function decodeTextFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  const utf8Decoded = buffer.toString("utf8");

  if (utf8Decoded.includes("�")) {
    return buffer.toString("latin1");
  }

  return utf8Decoded;
}

function parseCsvFile(filePath: string): ParsedFile {
  const content = decodeTextFile(filePath);

  // Auto-detect a ";" delimiter for European CSV exports: if the first
  // line contains more semicolons than commas, assume ";".
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const records: Record<string, string>[] = parse(content, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    // Real-world exports often have rows with a missing/extra trailing
    // column or stray quotes inside unquoted fields; tolerate both instead
    // of rejecting the whole file.
    relax_column_count: true,
    relax_quotes: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const rows = records.map((record) => stringifyRecord(record));

  return { headers, rows };
}

function stringifyRecord(record: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = value === null || value === undefined ? "" : String(value);
  }
  return result;
}

const CONTACT_FIELDS = [
  "prenom",
  "nom",
  "genre",
  "email",
  "entreprise",
  "fonction",
  "telephone",
  "adresse",
  "codePostal",
  "ville",
  "departement",
  "region",
  "pays",
  "siteWeb",
  "notes",
] as const;

type ContactFieldName = (typeof CONTACT_FIELDS)[number];

const HEADER_VARIANTS: Record<ContactFieldName, string[]> = {
  prenom: ["prenom", "prénom", "first name", "firstname"],
  // "nom" also covers organizational contacts (e.g. town halls) whose only
  // identifying name is a single combined field, not a person's last name.
  nom: ["nom", "last name", "lastname", "nom de famille"],
  genre: ["genre", "gender", "sexe", "civilite", "civilité", "titre"],
  email: ["email", "e-mail", "courriel", "adresse e-mail", "adresse email", "adresse mail"],
  entreprise: ["entreprise", "société", "societe", "company"],
  fonction: ["fonction", "poste", "job title", "title"],
  telephone: [
    "telephone",
    "téléphone",
    "phone",
    "tel",
    "numero de telephone",
    "numéro de téléphone",
    "numero de tel",
  ],
  adresse: ["adresse", "address", "adresse postale"],
  codePostal: ["code postal", "codepostal", "cp", "zip", "zip code", "postal code"],
  ville: ["ville", "city"],
  departement: ["departement", "département", "dept"],
  region: ["region", "région"],
  pays: ["pays", "country"],
  siteWeb: [
    "site internet",
    "site web",
    "website",
    "adresse du site internet",
    "adresse du site",
    "url",
  ],
  notes: ["notes", "note", "commentaire", "comment"],
};

/**
 * Normalizes a free-text "genre" cell (as found in imported spreadsheets —
 * "M"/"F", "Homme"/"Femme", "Male"/"Female", "M."/"Mme", etc.) into the
 * `Genre` enum. Returns `null` for an empty cell, and `"AUTRE"` for any
 * non-empty value that doesn't match a recognized male/female token, rather
 * than dropping the information or failing the row.
 */
function normalizeGenre(raw: string): "HOMME" | "FEMME" | "AUTRE" | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const homme = ["h", "m", "m.", "homme", "male", "man", "monsieur", "mr", "mr."];
  const femme = ["f", "mme", "femme", "female", "woman", "madame", "mrs", "mrs.", "ms", "ms."];

  if (homme.includes(value)) return "HOMME";
  if (femme.includes(value)) return "FEMME";
  return "AUTRE";
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .trim()
    .toLowerCase();
}

/**
 * Heuristic auto-mapping from detected file headers to Contact fields.
 * Unmatched fields map to `null` so the frontend can prompt the user to map
 * them manually.
 */
export function suggestColumnMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const usedHeaders = new Set<string>();

  for (const field of CONTACT_FIELDS) {
    const variants = HEADER_VARIANTS[field].map(normalizeHeader);
    const match = headers.find((header) => !usedHeaders.has(header) && variants.includes(normalizeHeader(header)));

    if (match) {
      mapping[field] = match;
      usedHeaders.add(match);
    } else {
      mapping[field] = null;
    }
  }

  return mapping;
}

export interface ImportRowsResult extends BulkCreateResult {}

// Fields it makes sense to auto-group contacts by at import time (one tag
// created per distinct value seen, e.g. one tag per Département). Free-text
// fields like notes/adresse/telephone are excluded since their values are
// essentially never repeated across rows, which would create one throwaway
// tag per contact instead of a useful group.
const GROUPABLE_FIELDS = ["departement", "region", "ville", "pays", "entreprise", "genre"] as const;
type GroupableField = (typeof GROUPABLE_FIELDS)[number];

export function isGroupableField(field: string): field is GroupableField {
  return (GROUPABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * Applies a column mapping to raw parsed rows, validates each row, and
 * delegates the actual persistence to `contact.service.bulkCreate`.
 *
 * - `tagNames`, if provided, are resolved/created and attached to EVERY
 *   successfully created contact.
 * - `groupByField`, if provided (one of `GROUPABLE_FIELDS`), auto-creates one
 *   tag per distinct value of that field seen across the file (e.g. one tag
 *   per Département) and attaches each contact to the tag matching its own
 *   row's value — this is the "groupe automatique à l'import" feature, apart
 *   from and additive with `tagNames`.
 */
export async function importRows(
  ownerId: string,
  rows: Record<string, string>[],
  columnMapping: Record<string, string>,
  tagNames?: string[],
  groupByField?: string
): Promise<ImportRowsResult> {
  if (groupByField && !isGroupableField(groupByField)) {
    throw new Error(`Champ de regroupement non autorisé: "${groupByField}"`);
  }

  const candidates: CreateContactInput[] = [];
  const groupValueByEmail = new Map<string, string>();
  const errors: Array<{ row: number; message: string }> = [];

  rows.forEach((row, index) => {
    // `prenom` is optional — many organizational contacts (town halls,
    // generic company inboxes) have no individual first name, only `nom`
    // and `email` are required for a row to be importable.
    const prenom = getMappedValue(row, columnMapping, "prenom");
    const nom = getMappedValue(row, columnMapping, "nom");
    const email = getMappedValue(row, columnMapping, "email");

    if (!nom) {
      errors.push({ row: index, message: "Le nom est manquant" });
      return;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      errors.push({ row: index, message: `Adresse email manquante ou invalide: "${email}"` });
      return;
    }

    candidates.push({
      prenom: prenom || null,
      nom,
      genre: normalizeGenre(getMappedValue(row, columnMapping, "genre")),
      email,
      entreprise: getMappedValue(row, columnMapping, "entreprise") || null,
      fonction: getMappedValue(row, columnMapping, "fonction") || null,
      telephone: getMappedValue(row, columnMapping, "telephone") || null,
      adresse: getMappedValue(row, columnMapping, "adresse") || null,
      codePostal: getMappedValue(row, columnMapping, "codePostal") || null,
      ville: getMappedValue(row, columnMapping, "ville") || null,
      departement: getMappedValue(row, columnMapping, "departement") || null,
      region: getMappedValue(row, columnMapping, "region") || null,
      pays: getMappedValue(row, columnMapping, "pays") || null,
      siteWeb: getMappedValue(row, columnMapping, "siteWeb") || null,
      notes: getMappedValue(row, columnMapping, "notes") || null,
      isUnsubscribed: false,
    });

    if (groupByField) {
      const groupValue = getMappedValue(row, columnMapping, groupByField);
      if (groupValue) {
        groupValueByEmail.set(email, groupValue);
      }
    }
  });

  const bulkResult = await contactService.bulkCreate(ownerId, candidates);

  const combinedErrors = [...errors, ...bulkResult.errors];

  const hasFixedTags = !!tagNames && tagNames.length > 0;
  const hasGroupTags = groupValueByEmail.size > 0;

  if ((hasFixedTags || hasGroupTags) && bulkResult.created > 0) {
    const distinctGroupValues = Array.from(new Set(groupValueByEmail.values()));
    const allTagNames = Array.from(new Set([...(tagNames ?? []), ...distinctGroupValues]));

    const tags = await tagService.findOrCreateMany(ownerId, allTagNames);
    const tagIdByName = new Map(tags.map((tag) => [tag.name, tag.id] as const));

    const fixedTagIds = (tagNames ?? [])
      .map((name) => tagIdByName.get(name))
      .filter((id): id is string => !!id);

    const createdEmails = candidates.map((c) => c.email);
    const createdContacts = await prisma.contact.findMany({
      where: { ownerId, email: { in: createdEmails } },
      select: { id: true, email: true },
    });

    if (createdContacts.length > 0) {
      const contactTagPairs = createdContacts.flatMap((contact) => {
        const pairs = fixedTagIds.map((tagId) => ({ contactId: contact.id, tagId }));
        const groupValue = groupValueByEmail.get(contact.email);
        const groupTagId = groupValue ? tagIdByName.get(groupValue) : undefined;
        if (groupTagId) {
          pairs.push({ contactId: contact.id, tagId: groupTagId });
        }
        return pairs;
      });

      if (contactTagPairs.length > 0) {
        await prisma.contactTag.createMany({ data: contactTagPairs, skipDuplicates: true });
      }
    }
  }

  return {
    created: bulkResult.created,
    skipped: bulkResult.skipped,
    errors: combinedErrors,
  };
}

function getMappedValue(
  row: Record<string, string>,
  columnMapping: Record<string, string>,
  field: string
): string {
  const sourceHeader = columnMapping[field];
  if (!sourceHeader) {
    return "";
  }
  return (row[sourceHeader] ?? "").trim();
}

/** Re-exported so controllers can decide dispatch by file extension too, if needed. */
export function extensionFromPath(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}
