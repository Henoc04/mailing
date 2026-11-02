import "dotenv/config";
import { z } from "zod";

/**
 * Zod schema describing every environment variable the backend depends on.
 * Parsing happens once, at import time, so the process fails fast (before
 * any HTTP server or Prisma client is created) if the environment is
 * misconfigured.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid URL (e.g. mysql://user:pass@host:port/db)" }),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_BASE_URL: z.string().url({ message: "PUBLIC_BASE_URL must be a valid URL" }),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters long"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"),
  CORS_ORIGIN: z.string().url({ message: "CORS_ORIGIN must be a valid URL" }),

  // Optional: the company-search feature degrades to a clear per-request
  // error (not a startup crash) when either key is missing, so these are
  // deliberately not required like the vars above.
  GEOAPIFY_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration. The following variables are missing or malformed:");
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
