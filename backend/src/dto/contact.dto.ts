import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants";

export const genreSchema = z.enum(["HOMME", "FEMME", "AUTRE"]);

export const createContactSchema = z.object({
  // Optional: many organizational contacts (e.g. town halls, generic
  // company inboxes) have no individual first name — only `nom` and
  // `email` are required. The {{prenom}} merge variable simply renders
  // empty for these contacts.
  prenom: z.string().max(120).optional().nullable(),
  nom: z.string().min(1).max(120),
  genre: genreSchema.optional().nullable(),
  email: z.string().email("Invalid email address"),
  entreprise: z.string().max(255).optional().nullable(),
  fonction: z.string().max(255).optional().nullable(),
  telephone: z.string().max(50).optional().nullable(),
  adresse: z.string().max(255).optional().nullable(),
  codePostal: z.string().max(20).optional().nullable(),
  ville: z.string().max(120).optional().nullable(),
  departement: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  pays: z.string().max(120).optional().nullable(),
  siteWeb: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  isUnsubscribed: z.boolean().optional().default(false),
  tagIds: z.array(z.string()).optional(),
});

export const updateContactSchema = z.object({
  prenom: z.string().max(120).optional().nullable(),
  nom: z.string().min(1).max(120).optional(),
  genre: genreSchema.optional().nullable(),
  email: z.string().email("Invalid email address").optional(),
  entreprise: z.string().max(255).optional().nullable(),
  fonction: z.string().max(255).optional().nullable(),
  telephone: z.string().max(50).optional().nullable(),
  adresse: z.string().max(255).optional().nullable(),
  codePostal: z.string().max(20).optional().nullable(),
  ville: z.string().max(120).optional().nullable(),
  departement: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  pays: z.string().max(120).optional().nullable(),
  siteWeb: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  isUnsubscribed: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});

export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(255).optional(),
  sortBy: z
    .enum([
      "prenom",
      "nom",
      "email",
      "entreprise",
      "ville",
      "departement",
      "region",
      "pays",
      "createdAt",
      "updatedAt",
    ])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  tagId: z.string().optional(),
  isUnsubscribed: z.coerce.boolean().optional(),
});

// Same filter shape as listContactsQuerySchema, minus pagination/sort —
// used to resolve "every contact matching this filter" for bulk actions
// (e.g. assign a group to all contacts in a search/tag/status filter,
// not just the ones visible on the current page).
export const contactFilterSchema = z.object({
  search: z.string().trim().max(255).optional(),
  tagId: z.string().optional(),
  isUnsubscribed: z.coerce.boolean().optional(),
});

export const bulkTagActionSchema = z
  .object({
    tagId: z.string().min(1),
    action: z.enum(["add", "remove"]),
    contactIds: z.array(z.string()).optional(),
    filter: contactFilterSchema.optional(),
  })
  .refine((data) => (data.contactIds && data.contactIds.length > 0) || !!data.filter, {
    message: "Provide either a non-empty contactIds array or a filter",
    path: ["contactIds"],
  });

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type ContactFilter = z.infer<typeof contactFilterSchema>;
export type BulkTagActionInput = z.infer<typeof bulkTagActionSchema>;
