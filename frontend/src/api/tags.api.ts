import { client } from "./client";
import type { Tag } from "./types";

export interface CreateTagInput {
  name: string;
  color?: string | null;
}

export async function list(): Promise<Tag[]> {
  const { data } = await client.get<Tag[]>("/tags");
  return data;
}

export async function create(input: CreateTagInput): Promise<Tag> {
  const { data } = await client.post<Tag>("/tags", input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/tags/${id}`);
}
