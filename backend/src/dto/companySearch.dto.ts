import { z } from "zod";

export const companySearchSchema = z.object({
  country: z.string().min(1),
  city: z.string().min(1),
  sectors: z.array(z.string().min(1)).min(1),
});

export const guessEmailSchema = z.object({
  website: z.string().min(1),
});

export type CompanySearchInput = z.infer<typeof companySearchSchema>;
export type GuessEmailInput = z.infer<typeof guessEmailSchema>;
