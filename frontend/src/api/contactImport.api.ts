import { client } from "./client";

export interface ContactImportPreviewResult {
  filePath: string;
  headers: string[];
  rows: Record<string, unknown>[];
  suggestedMapping: Record<string, string>;
}

export interface ContactImportConfirmResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export async function preview(file: File): Promise<ContactImportPreviewResult> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await client.post<ContactImportPreviewResult>("/contact-imports/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function confirm(
  filePath: string,
  columnMapping: Record<string, string>,
  tagNames?: string[],
  groupByField?: string
): Promise<ContactImportConfirmResult> {
  const { data } = await client.post<ContactImportConfirmResult>("/contact-imports/confirm", {
    filePath,
    columnMapping,
    tagNames,
    groupByField,
  });
  return data;
}
