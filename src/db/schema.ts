import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ScriptMetadata } from "@/lib/userscript";
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").notNull().defaultNow();
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  bio: text("bio").notNull().default(""),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: time("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    uniqueIndex("account_provider_unique").on(t.providerId, t.accountId),
  ],
);
export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const scripts = pgTable(
  "scripts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("Utilities"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
    visibility: text("visibility")
      .$type<"public" | "unlisted" | "private">()
      .notNull()
      .default("private"),
    hidden: boolean("hidden").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("script_owner_idx").on(t.ownerId),
    index("script_discovery_idx").on(t.visibility, t.hidden, t.updatedAt),
    check(
      "visibility_values",
      sql`${t.visibility} in ('public','unlisted','private')`,
    ),
    check("positive_revision", sql`${t.revision} > 0`),
  ],
);
export const versions = pgTable(
  "script_versions",
  {
    id: text("id").primaryKey(),
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    version: text("version").notNull(),
    source: text("source").notNull(),
    changelog: text("changelog").notNull().default(""),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("version_revision_unique").on(t.scriptId, t.revision),
    uniqueIndex("version_label_unique").on(t.scriptId, t.version),
  ],
);
export const metadata = pgTable("script_metadata", {
  versionId: text("version_id")
    .primaryKey()
    .references(() => versions.id, { onDelete: "cascade" }),
  directives: jsonb("directives").$type<ScriptMetadata>().notNull(),
});
export const library = pgTable(
  "library_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("library_user_script_unique").on(t.userId, t.scriptId),
    index("library_version_idx").on(t.versionId),
  ],
);
export const installations = pgTable(
  "installations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("install_unique_user_script").on(t.userId, t.scriptId),
    index("install_script_idx").on(t.scriptId, t.createdAt),
  ],
);
export const collections = pgTable(
  "collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("collection_name_unique").on(t.userId, t.name)],
);
export const collectionEntries = pgTable(
  "collection_entries",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    libraryId: text("library_id")
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.libraryId] }),
    index("collection_library_idx").on(t.libraryId),
  ],
);
export const ratings = pgTable(
  "ratings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.scriptId] }),
    check("rating_range", sql`${t.score} between 1 and 5`),
    index("rating_script_idx").on(t.scriptId),
  ],
);
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    scriptId: text("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("report_review_idx").on(t.resolved, t.createdAt)],
);
export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.authorId] }),
    check("no_self_follow", sql`${t.followerId} <> ${t.authorId}`),
  ],
);
export const launcherAuthorizations = pgTable(
  "launcher_authorizations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("launcher_user_idx").on(t.userId),
    index("launcher_expiry_idx").on(t.expiresAt),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    createdAt: created(),
  },
  (t) => [index("audit_user_time_idx").on(t.userId, t.createdAt)],
);
export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: time("reset_at").notNull(),
  },
  (t) => [index("api_rate_expiry_idx").on(t.resetAt)],
);
