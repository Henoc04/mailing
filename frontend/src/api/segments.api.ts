import { client } from "./client";
import type { Segment, SegmentFilterMode, SegmentFilterRule } from "./types";

export interface CreateSegmentInput {
  name: string;
  description?: string | null;
  filterMode?: SegmentFilterMode;
  filterJson: SegmentFilterRule[];
}

export type UpdateSegmentInput = Partial<CreateSegmentInput>;

export async function list(): Promise<Segment[]> {
  const { data } = await client.get<Segment[]>("/segments");
  return data;
}

export async function getOne(id: string): Promise<Segment> {
  const { data } = await client.get<Segment>(`/segments/${id}`);
  return data;
}

export async function create(input: CreateSegmentInput): Promise<Segment> {
  const { data } = await client.post<Segment>("/segments", input);
  return data;
}

export async function update(id: string, input: UpdateSegmentInput): Promise<Segment> {
  const { data } = await client.put<Segment>(`/segments/${id}`, input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/segments/${id}`);
}
