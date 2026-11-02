import { client } from "./client";
import type { Attachment, Template } from "./types";

export interface CreateTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  isDraft?: boolean;
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export async function list(): Promise<Template[]> {
  const { data } = await client.get<Template[]>("/templates");
  return data;
}

export async function getOne(id: string): Promise<Template> {
  const { data } = await client.get<Template>(`/templates/${id}`);
  return data;
}

export async function create(input: CreateTemplateInput): Promise<Template> {
  const { data } = await client.post<Template>("/templates", input);
  return data;
}

export async function update(id: string, input: UpdateTemplateInput): Promise<Template> {
  const { data } = await client.put<Template>(`/templates/${id}`, input);
  return data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/templates/${id}`);
}

export async function duplicate(id: string): Promise<Template> {
  const { data } = await client.post<Template>(`/templates/${id}/duplicate`);
  return data;
}

// Returns a public URL usable directly as an <img src> in the email body.
export async function uploadImage(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  // Must match the backend's multer config: `.single("image")`.
  formData.append("image", file);
  const { data } = await client.post<{ url: string }>("/templates/images", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadAttachments(id: string, files: File[]): Promise<Attachment[]> {
  const formData = new FormData();
  // Field name must match the backend's multer config exactly:
  // `uploadAttachments = multer({ ... }).array("attachments", 10)`.
  files.forEach((file) => formData.append("attachments", file));

  const { data } = await client.post<Attachment[]>(`/templates/${id}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function removeAttachment(id: string, attachmentId: string): Promise<void> {
  await client.delete(`/templates/${id}/attachments/${attachmentId}`);
}
