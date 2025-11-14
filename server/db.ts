import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

console.log("[DB] Initializing database connection...");

if (!process.env.DATABASE_URL) {
  console.error("[DB] DATABASE_URL environment variable is missing!");
  throw new Error("DATABASE_URL environment variable is required");
}

console.log("[DB] DATABASE_URL is set");

// Создаем пул подключений для локального PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

console.log("[DB] Database connection initialized successfully");
