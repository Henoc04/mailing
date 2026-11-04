import { client } from "./client";
import type { ContactWithTags, Genre, PaginatedResult } from "./types";

export interface ListContactsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?:
    | "prenom"
    | "nom"
    | "email"
    | "entreprise"
    | "ville"
    | "departement"
    | "region"
    | "pays"
    | "createdAt"
    | "updatedAt";
  sortDir?: "asc" | "desc";
  tagId?: string;
  isUnsubscribed?: boolean;
}

export interface CreateContactInput {
  // Optional: organizational contacts (e.g. town halls) often have no
  // individual first name.
  prenom?: string | null;
  nom: string;
  genre?: Genre | null;
  email: string;
  entreprise?: string | null;
  fonction?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  departement?: string | null;
  region?: string | null;
  pays?: string | null;
  siteWeb?: string | null;
  notes?: string | null;
  isUnsubscribed?: boolean;
  tagIds?: string[];
}

export type UpdateContactInput = Partial<CreateContactInput>;

export async function list(query: ListContactsQuery = {}): Promise<PaginatedResult<ContactWithTags>> {
  const { data } = await client.get<PaginatedResult<ContactWithTags>>("/contacts", { params: query });
  return data;
}

export async function getOne(id: string): Promise<ContactWithTags> {
  const { data } = await client.get<ContactWithTags>(`/contacts/${id}`);
  return data;
}

export async function create(input: CreateContactInput): Promise<ContactWithTags> {
  const { data } = await client.post<ContactWithTags>("/contacts", input);
  return data;
}

export async function update(id: string, input: UpdateContactInput): Promise<ContactWithTags> {
  const { data } = await client.put<ContactWithTags>(`/contacts/${id}`, input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/contacts/${id}`);
}

export async function setTags(id: string, tagIds: string[]): Promise<{ success: true }> {
  const { data } = await client.put<{ success: true }>(`/contacts/${id}/tags`, { tagIds });
  return data;
}

export interface ContactFilter {
  search?: string;
  tagId?: string;
  isUnsubscribed?: boolean;
}

export interface BulkTagInput {
  tagId: string;
  action: "add" | "remove";
  contactIds?: string[];
  filter?: ContactFilter;
}

export interface BulkTagResult {
  updated: number;
}

// Adds or removes a single group (tag) across many contacts at once, either
// an explicit id list or every contact matching a filter (e.g. "every
// contact currently matching this search"). Unlike `setTags`, this never
// touches a contact's other tag associations.
export async function bulkTag(input: BulkTagInput): Promise<BulkTagResult> {
  const { data } = await client.post<BulkTagResult>("/contacts/bulk-tag", input);
  return data;
}

export interface BulkDeleteInput {
  contactIds?: string[];
  filter?: ContactFilter;
}

export interface BulkDeleteResult {
  deleted: number;
  /** Contacts kept because they belong to a campaign being sent, paused or scheduled. */
  skipped: number;
}

// Deletes an explicit id list, or every contact matching a filter.
export async function bulkDelete(input: BulkDeleteInput): Promise<BulkDeleteResult> {
  const { data } = await client.post<BulkDeleteResult>("/contacts/bulk-delete", input);
  return data;
}
