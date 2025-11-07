import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

console.log("[DB] Initializing database connection...");

if (!process.env.DATABASE_URL) {
  console.error("[DB] DATABASE_URL environment variable is missing!");
  throw new Error("DATABASE_URL environment variable is required");
}

console.log("[DB] DATABASE_URL is set");

const databaseUrl = process.env.DATABASE_URL.includes('?')
  ? `${process.env.DATABASE_URL}&pooled=true`
  : `${process.env.DATABASE_URL}?pooled=true`;

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });

console.log("[DB] Database connection initialized successfully");
