import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { database } from "@/db";
import * as schema from "@/db/schema";
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!process.env.BETTER_AUTH_URL)
    throw new Error("BETTER_AUTH_URL is required.");
  return betterAuth({
    appName: "Raxlet",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    trustedOrigins: [new URL(process.env.BETTER_AUTH_URL).origin],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}

export function auth() {
  return (instance ??= createAuth());
}
