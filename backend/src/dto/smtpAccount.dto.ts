import { z } from "zod";

export const smtpSecuritySchema = z.enum(["NONE", "SSL", "STARTTLS"]);

export const createSmtpAccountSchema = z.object({
  label: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  security: smtpSecuritySchema.default("STARTTLS"),
  username: z.string().min(1).max(255),
  password: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid from email address"),
  fromName: z.string().min(1).max(255),
  rotationGroup: z.string().max(120).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  dailyQuota: z.coerce.number().int().positive().optional().nullable(),
});

export const updateSmtpAccountSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  security: smtpSecuritySchema.optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).optional(),
  fromEmail: z.string().email("Invalid from email address").optional(),
  fromName: z.string().min(1).max(255).optional(),
  rotationGroup: z.string().max(120).optional().nullable(),
  isActive: z.boolean().optional(),
  dailyQuota: z.coerce.number().int().positive().optional().nullable(),
});

export type CreateSmtpAccountInput = z.infer<typeof createSmtpAccountSchema>;
export type UpdateSmtpAccountInput = z.infer<typeof updateSmtpAccountSchema>;
