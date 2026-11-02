import { client } from "./client";
import type { Draft } from "./types";

export type DraftType = "CAMPAIGN" | "TEMPLATE";

export async function list(type?: DraftType): Promise<Draft[]> {
  const { data } = await client.get<Draft[]>("/drafts", { params: type ? { type } : undefined });
  return data;
}
