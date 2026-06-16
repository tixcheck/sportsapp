import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside the Next.js runtime, so it does not get Next's
// automatic .env.local loading. Load it explicitly here.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Keep migrations explicit and reviewable; no auto-push to the live DB.
  strict: true,
  verbose: true,
});
