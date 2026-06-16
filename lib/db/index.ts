import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Drizzle talks to Postgres directly via the Supabase transaction pooler
// (DATABASE_URL). This is server-only — never import this from a client
// component. The Supabase client (with the publishable key) handles
// RLS-protected reads/auth from the browser.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// The transaction pooler does not support prepared statements, so disable them.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
