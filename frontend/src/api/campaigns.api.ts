import { client } from "./client";
import type { Attachment, Campaign, CampaignProgress, CampaignTargetType, ContactWithTags } from "./types";

export interface CreateCampaignInput {
  name: string;
  templateId?: string | null;
  subjectOverride?: string | null;
  targetType?: CampaignTargetType;
  targetContactId?: string | null;
  segmentIds?: string[];
  tagIds?: string[];
  smtpAccountIds: string[];
  useRotation?: boolean;
  baseDelayMs?: number;
  jitterMs?: number;
  maxPerMinute?: number | null;
  maxPerHour?: number | null;
  maxRetries?: number;
  scheduledAt?: string | null;
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

export interface ResolveRecipientsResult {
  totalRecipients: number;
}

export interface PreviewForContactResult {
  subject: string;
  bodyHtml: string;
}

export async function list(): Promise<Campaign[]> {
  const { data } = await client.get<Campaign[]>("/campaigns");
  return data;
}

export async function getOne(id: string): Promise<Campaign> {
  const { data } = await client.get<Campaign>(`/campaigns/${id}`);
  return data;
}

export async function create(input: CreateCampaignInput): Promise<Campaign> {
  const { data } = await client.post<Campaign>("/campaigns", input);
  return data;
}

export async function update(id: string, input: UpdateCampaignInput): Promise<Campaign> {
  const { data } = await client.put<Campaign>(`/campaigns/${id}`, input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/campaigns/${id}`);
}

export async function duplicate(id: string): Promise<Campaign> {
  const { data } = await client.post<Campaign>(`/campaigns/${id}/duplicate`);
  return data;
}

export async function resolveRecipients(id: string): Promise<ResolveRecipientsResult> {
  const { data } = await client.post<ResolveRecipientsResult>(`/campaigns/${id}/resolve`);
  return data;
}

export interface PreviewRecipientsInput {
  targetType: CampaignTargetType;
  targetContactId?: string | null;
  segmentIds?: string[];
  tagIds?: string[];
}

export interface PreviewRecipientsResult {
  totalCount: number;
  contacts: ContactWithTags[];
}

export async function previewRecipients(input: PreviewRecipientsInput): Promise<PreviewRecipientsResult> {
  const { data } = await client.post<PreviewRecipientsResult>("/campaigns/preview-recipients", input);
  return data;
}

export async function preview(id: string, contactId: string): Promise<PreviewForContactResult> {
  const { data } = await client.post<PreviewForContactResult>(`/campaigns/${id}/preview`, { contactId });
  return data;
}

export async function uploadAttachments(id: string, files: File[]): Promise<Attachment[]> {
  const formData = new FormData();
  // Field name must match the backend's multer config exactly:
  // `uploadAttachments = multer({ ... }).array("attachments", 10)`.
  files.forEach((file) => formData.append("attachments", file));

  const { data } = await client.post<Attachment[]>(`/campaigns/${id}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function removeAttachment(id: string, attachmentId: string): Promise<void> {
  await client.delete(`/campaigns/${id}/attachments/${attachmentId}`);
}

export async function start(id: string): Promise<{ success: true }> {
  const { data } = await client.post<{ success: true }>(`/campaigns/${id}/start`);
  return data;
}

export async function pause(id: string): Promise<{ success: true }> {
  const { data } = await client.post<{ success: true }>(`/campaigns/${id}/pause`);
  return data;
}

export async function resume(id: string): Promise<{ success: true }> {
  const { data } = await client.post<{ success: true }>(`/campaigns/${id}/resume`);
  return data;
}

export async function cancel(id: string): Promise<{ success: true }> {
  const { data } = await client.post<{ success: true }>(`/campaigns/${id}/cancel`);
  return data;
}

export async function getProgress(id: string): Promise<CampaignProgress> {
  const { data } = await client.get<CampaignProgress>(`/campaigns/${id}/progress`);
  return data;
}

export async function testSend(id: string, input: { email: string; contactId?: string }): Promise<{ sentTo: string }> {
  const { data } = await client.post<{ sentTo: string }>(`/campaigns/${id}/test-send`, input);
  return data;
}

export type RecipientStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export interface RecipientLogItem {
  id: string;
  email: string;
  name: string;
  status: RecipientStatus;
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
  durationMs: number | null;
  openedAt: string | null;
  openCount: number;
}

export interface RecipientLogPage {
  items: RecipientLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRecipients(
  id: string,
  query: { status?: RecipientStatus; search?: string; page?: number; pageSize?: number }
): Promise<RecipientLogPage> {
  const { data } = await client.get<RecipientLogPage>(`/campaigns/${id}/recipients`, { params: query });
  return data;
}

export interface TagStat {
  tagId: string | null;
  tagName: string;
  recipients: number;
  sent: number;
  failed: number;
  opened: number;
  openRate: number;
}

export async function statsByTag(id: string): Promise<TagStat[]> {
  const { data } = await client.get<TagStat[]>(`/campaigns/${id}/stats-by-tag`);
  return data;
}
