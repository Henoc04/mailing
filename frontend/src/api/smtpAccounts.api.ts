import { client } from "./client";
import type { SmtpAccount, SmtpSecurity } from "./types";

export interface CreateSmtpAccountInput {
  label: string;
  host: string;
  port: number;
  security?: SmtpSecurity;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  rotationGroup?: string | null;
  isActive?: boolean;
  dailyQuota?: number | null;
}

export type UpdateSmtpAccountInput = Partial<CreateSmtpAccountInput>;

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export async function list(): Promise<SmtpAccount[]> {
  const { data } = await client.get<SmtpAccount[]>("/smtp-accounts");
  return data;
}

export async function getOne(id: string): Promise<SmtpAccount> {
  const { data } = await client.get<SmtpAccount>(`/smtp-accounts/${id}`);
  return data;
}

export async function create(input: CreateSmtpAccountInput): Promise<SmtpAccount> {
  const { data } = await client.post<SmtpAccount>("/smtp-accounts", input);
  return data;
}

export async function update(id: string, input: UpdateSmtpAccountInput): Promise<SmtpAccount> {
  const { data } = await client.put<SmtpAccount>(`/smtp-accounts/${id}`, input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/smtp-accounts/${id}`);
}

export async function testConnection(id: string): Promise<TestConnectionResult> {
  const { data } = await client.post<TestConnectionResult>(`/smtp-accounts/${id}/test`);
  return data;
}
