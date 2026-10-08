import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
let singleton: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Configure Neon PostgreSQL in .env.local.");
  if (!singleton) singleton = drizzle(new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:5000}),{schema});
  return singleton;
}
