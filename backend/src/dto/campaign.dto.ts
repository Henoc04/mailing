import { z } from "zod";

export const campaignTargetTypeSchema = z.enum(["SINGLE", "SEGMENTS", "ALL"]);

export const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(150),
    templateId: z.string().optional().nullable(),
    subjectOverride: z.string().max(255).optional().nullable(),
    targetType: campaignTargetTypeSchema.default("SEGMENTS"),
    targetContactId: z.string().optional().nullable(),
    segmentIds: z.array(z.string()).optional().default([]),
    tagIds: z.array(z.string()).optional().default([]),
    smtpAccountIds: z.array(z.string()).min(1, "At least one SMTP account is required"),
    useRotation: z.boolean().optional().default(false),
    baseDelayMs: z.coerce.number().int().min(0).optional().default(3000),
    jitterMs: z.coerce.number().int().min(0).optional().default(2000),
    maxPerMinute: z.coerce.number().int().positive().optional().nullable(),
    maxPerHour: z.coerce.number().int().positive().optional().nullable(),
    maxRetries: z.coerce.number().int().min(0).optional().default(3),
    scheduledAt: z.string().datetime().optional().nullable(),
  })
  .refine((data) => data.targetType !== "SINGLE" || !!data.targetContactId, {
    message: "targetContactId is required when targetType is SINGLE",
    path: ["targetContactId"],
  })
  .refine(
    (data) =>
      data.targetType !== "SEGMENTS" ||
      (data.segmentIds && data.segmentIds.length > 0) ||
      (data.tagIds && data.tagIds.length > 0),
    {
      message: "segmentIds or tagIds must contain at least one entry when targetType is SEGMENTS",
      path: ["segmentIds"],
    }
  );

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  templateId: z.string().optional().nullable(),
  subjectOverride: z.string().max(255).optional().nullable(),
  targetType: campaignTargetTypeSchema.optional(),
  targetContactId: z.string().optional().nullable(),
  segmentIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  smtpAccountIds: z.array(z.string()).min(1).optional(),
  useRotation: z.boolean().optional(),
  baseDelayMs: z.coerce.number().int().min(0).optional(),
  jitterMs: z.coerce.number().int().min(0).optional(),
  maxPerMinute: z.coerce.number().int().positive().optional().nullable(),
  maxPerHour: z.coerce.number().int().positive().optional().nullable(),
  maxRetries: z.coerce.number().int().min(0).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

// Deliberately no `.refine()` here (unlike createCampaignSchema): an empty
// selection while the user is still picking segments/tags in the wizard is
// valid input that should just resolve to 0 contacts, not a 400 error.
export const previewRecipientsSchema = z.object({
  targetType: campaignTargetTypeSchema,
  targetContactId: z.string().optional().nullable(),
  segmentIds: z.array(z.string()).optional().default([]),
  tagIds: z.array(z.string()).optional().default([]),
});

export const testSendSchema = z.object({
  email: z.string().trim().email("Adresse email invalide"),
  contactId: z.string().optional(),
});

export const listRecipientsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type PreviewRecipientsInput = z.infer<typeof previewRecipientsSchema>;
