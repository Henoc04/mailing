import { z } from "zod";

export const segmentFilterModeSchema = z.enum(["AND", "OR"]);

export const segmentFilterRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.unknown(),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  filterMode: segmentFilterModeSchema.default("AND"),
  filterJson: z.array(segmentFilterRuleSchema).min(1, "At least one filter rule is required"),
});

export const updateSegmentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  filterMode: segmentFilterModeSchema.optional(),
  filterJson: z.array(segmentFilterRuleSchema).min(1).optional(),
});

export type SegmentFilterRule = z.infer<typeof segmentFilterRuleSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;
