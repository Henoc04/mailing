import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // src/config/env.ts validates the environment at import time and exits
    // on failure; give it harmless values so pure-logic tests can import
    // any service module without a real .env or database.
    env: {
      DATABASE_URL: "mysql://test:test@localhost:3306/test",
      PUBLIC_BASE_URL: "https://crm.example.test",
      JWT_SECRET: "test-secret-at-least-16-chars",
      ENCRYPTION_KEY: "0".repeat(64),
      CORS_ORIGIN: "http://localhost:5173",
      NODE_ENV: "test",
    },
  },
});
