import { client } from "./client";
import type { DashboardSummary } from "./types";

export async function getSummary(): Promise<DashboardSummary> {
  const { data } = await client.get<DashboardSummary>("/dashboard");
  return data;
}
