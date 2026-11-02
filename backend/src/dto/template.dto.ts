import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(150),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1, "Template body is required"),
  bodyText: z.string().optional().nullable(),
  isDraft: z.boolean().optional().default(false),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  subject: z.string().min(1).max(255).optional(),
  bodyHtml: z.string().min(1).optional(),
  bodyText: z.string().optional().nullable(),
  isDraft: z.boolean().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
