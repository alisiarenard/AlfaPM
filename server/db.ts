import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

console.log("[DB] Initializing database connection...");

if (!process.env.DATABASE_URL) {
  console.error("[DB] DATABASE_URL environment variable is missing!");
  throw new Error("DATABASE_URL environment variable is required");
}

console.log("[DB] DATABASE_URL is set");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

export const db = drizzle(pool, { schema });

console.log("[DB] Database connection initialized successfully");
