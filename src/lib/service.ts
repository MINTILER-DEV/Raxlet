import {
  and,
  eq,
  desc,
  asc,
  sql,
  ilike,
  or,
  ne,
  gte,
  count,
} from "drizzle-orm";
import { z } from "zod";
import { gt, valid } from "semver";
import { database } from "@/db";
import * as t from "@/db/schema";
import {
  HttpError,
  fail,
  id,
  identity,
  admin,
  owned,
  visibleTo,
  body,
  ok,
  origin,
  isAdmin,
} from "./http";
import {
  scriptInput,
  scriptPatch,
  versionInput,
  libraryPatch,
  pagination,
  profileInput,
} from "./validation";
import { parseMetadata, analyzeCompatibility, matchesUrl } from "./userscript";
import { validateSource } from "./source";
import { importUrl } from "./import-url";
const current = () => database();
const audit = async (uid: string, action: string, resourceId?: string) => {
  await current()
    .insert(t.auditLogs)
    .values({ id: id(), userId: uid, action, resourceId });
};
async function viewer(req: Request) {
  try {
    return await identity(req);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return undefined;
    throw e;
  }
}
async function scriptFor(identifier: string, uid?: string) {
  const [s] = await current()
    .select()
    .from(t.scripts)
    .innerJoin(t.user, eq(t.user.id, t.scripts.ownerId))
    .where(or(eq(t.scripts.id, identifier), eq(t.scripts.slug, identifier)));
  if (
    !s ||
    !visibleTo(s.scripts, uid) ||
    (s.users.suspended && s.scripts.ownerId !== uid)
  )
    return fail(404, "NOT_FOUND", "Script not found.");
  return s.scripts;
}
async function versionFor(scriptId: string, revision?: number) {
  const [v] = await current()
    .select({
      id: t.versions.id,
      scriptId: t.versions.scriptId,
      revision: t.versions.revision,
      version: t.versions.version,
      source: t.versions.source,
      changelog: t.versions.changelog,
      createdAt: t.versions.createdAt,
      metadata: t.metadata.directives,
    })
    .from(t.versions)
    .innerJoin(t.metadata, eq(t.metadata.versionId, t.versions.id))
    .where(
      and(
        eq(t.versions.scriptId, scriptId),
        revision ? eq(t.versions.revision, revision) : undefined,
      ),
    )
    .orderBy(desc(t.versions.revision))
    .limit(1);
  if (!v) return fail(404, "NOT_FOUND", "Version not found.");
  return { ...v, compatibility: analyzeCompatibility(v.metadata, v.source) };
}
async function listRegistry(req: Request, mode = "search", ownerId?: string) {
  const p = pagination.parse(Object.fromEntries(new URL(req.url).searchParams));
  const conditions = and(
    eq(t.scripts.visibility, "public"),
    eq(t.scripts.hidden, false),
    eq(t.user.suspended, false),
    ownerId ? eq(t.scripts.ownerId, ownerId) : undefined,
    p.q
      ? or(
          ilike(t.scripts.name, `%${p.q.replace(/[\\%_]/g, "\\$&")}%`),
          ilike(t.scripts.description, `%${p.q.replace(/[\\%_]/g, "\\$&")}%`),
        )
      : undefined,
    p.category ? eq(t.scripts.category, p.category) : undefined,
    p.tag
      ? sql`${t.scripts.tags} @> ${JSON.stringify([p.tag])}::jsonb`
      : undefined,
    p.website
      ? sql`exists (select 1 from script_versions v join script_metadata m on m.version_id=v.id where v.script_id=${t.scripts.id} and v.revision=${t.scripts.revision} and (coalesce(m.directives->'match','[]'::jsonb) || coalesce(m.directives->'include','[]'::jsonb))::text ilike ${"%" + p.website.replace(/[\\%_]/g, "\\$&") + "%"})`
      : undefined,
  );
  const installs = sql<number>`(select count(*)::int from installations i where i.script_id=${t.scripts.id})`;
  const recent = sql<number>`(select count(*)::int from installations i where i.script_id=${t.scripts.id} and i.created_at > now() - interval '7 days')`;
  const rating = sql<number>`(select round(avg(r.score),1)::float from ratings r where r.script_id=${t.scripts.id})`;
  const result = await current()
    .select({
      id: t.scripts.id,
      slug: t.scripts.slug,
      name: t.scripts.name,
      description: t.scripts.description,
      category: t.scripts.category,
      tags: t.scripts.tags,
      updatedAt: t.scripts.updatedAt,
      author: t.user.name,
      username: t.user.username,
      installs,
      rating,
    })
    .from(t.scripts)
    .innerJoin(t.user, eq(t.user.id, t.scripts.ownerId))
    .where(conditions)
    .orderBy(
      ...(mode === "trending"
        ? [desc(recent), desc(installs), desc(t.scripts.updatedAt)]
        : [desc(t.scripts.updatedAt)]),
      asc(t.scripts.id),
    )
    .limit(p.limit)
    .offset((p.page - 1) * p.limit);
  const [total] = await current()
    .select({ value: count() })
    .from(t.scripts)
    .innerJoin(t.user, eq(t.user.id, t.scripts.ownerId))
    .where(conditions);
  return ok(result, 200, { page: p.page, limit: p.limit, total: total.value });
}
export async function libraryFor(uid: string) {
  return current()
    .select({
      id: t.library.id,
      scriptId: t.scripts.id,
      slug: t.scripts.slug,
      name: t.scripts.name,
      description: t.scripts.description,
      ownerId: t.scripts.ownerId,
      visibility: t.scripts.visibility,
      enabled: t.library.enabled,
      pinned: t.library.pinned,
      settings: t.library.settings,
      versionId: t.library.versionId,
      version: t.versions.version,
      revision: t.versions.revision,
      latestRevision: t.scripts.revision,
      metadata: t.metadata.directives,
      source: t.versions.source,
    })
    .from(t.library)
    .innerJoin(t.scripts, eq(t.library.scriptId, t.scripts.id))
    .innerJoin(t.user, eq(t.user.id, t.scripts.ownerId))
    .innerJoin(t.versions, eq(t.library.versionId, t.versions.id))
    .innerJoin(t.metadata, eq(t.metadata.versionId, t.versions.id))
    .where(
      and(
        eq(t.library.userId, uid),
        or(
          eq(t.scripts.ownerId, uid),
          and(
            eq(t.scripts.hidden, false),
            ne(t.scripts.visibility, "private"),
            eq(t.user.suspended, false),
          ),
        ),
      ),
    )
    .orderBy(desc(t.library.pinned), desc(t.library.createdAt));
}
export async function route(req: Request, parts: string[]): Promise<Response> {
  const method = req.method;
  const [resource, identifier, action] = parts;
  if (resource === "health" && method === "GET") {
    await current().execute(sql`select 1`);
    return ok({ status: "ok", database: "connected" });
  }
  if (
    resource === "registry" &&
    method === "GET" &&
    ["search", "latest", "trending"].includes(identifier)
  )
    return listRegistry(req, identifier);
  if (resource === "scripts") {
    if (!identifier && method === "GET") return listRegistry(req);
    if (!identifier && method === "POST") {
      const u = await identity(req);
      const input = await body(req, scriptInput);
      let meta;
      try {
        meta = validateSource(input.source);
      } catch (e) {
        return fail(400, "INVALID_METADATA", (e as Error).message);
      }
      const sid = id(),
        vid = id();
      const result = await current().transaction(async (tx) => {
        const [s] = await tx
          .insert(t.scripts)
          .values({
            id: sid,
            ownerId: u.id,
            slug:
              meta.name[0]
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .slice(0, 60) +
              "-" +
              sid,
            name: meta.name[0],
            description: meta.description?.[0] ?? "",
            visibility: input.visibility,
            category: input.category,
            tags: input.tags,
            screenshots: input.screenshots,
          })
          .returning();
        await tx.insert(t.versions).values({
          id: vid,
          scriptId: sid,
          revision: 1,
          version: meta.version[0],
          source: input.source,
          changelog: input.changelog,
        });
        await tx
          .insert(t.metadata)
          .values({ versionId: vid, directives: { ...meta } });
        await tx
          .insert(t.library)
          .values({ id: id(), userId: u.id, scriptId: sid, versionId: vid });
        await tx.insert(t.auditLogs).values({
          id: id(),
          userId: u.id,
          action: "script.created",
          resourceId: sid,
        });
        return s;
      });
      return ok(result, 201);
    }
    const u = await viewer(req);
    const s = await scriptFor(identifier, u?.id);
    if (!action && method === "GET") {
      const [author] = await current()
        .select({
          id: t.user.id,
          name: t.user.name,
          username: t.user.username,
          bio: t.user.bio,
        })
        .from(t.user)
        .where(eq(t.user.id, s.ownerId));
      const [stats] = await current()
        .select({
          installs: sql<number>`(select count(*)::int from installations where script_id=${s.id})`,
          rating: sql<number>`(select round(avg(score),1)::float from ratings where script_id=${s.id})`,
        })
        .from(t.scripts)
        .where(eq(t.scripts.id, s.id));
      return ok({
        ...s,
        author,
        ...stats,
        current: await versionFor(s.id, s.revision),
      });
    }
    if (action === "versions" && method === "GET")
      return ok(
        await current()
          .select({
            id: t.versions.id,
            version: t.versions.version,
            revision: t.versions.revision,
            changelog: t.versions.changelog,
            createdAt: t.versions.createdAt,
          })
          .from(t.versions)
          .where(eq(t.versions.scriptId, s.id))
          .orderBy(desc(t.versions.revision)),
      );
    if (action === "source" && method === "GET") {
      const vid = new URL(req.url).searchParams.get("version");
      if (vid) {
        const [v] = await current()
          .select()
          .from(t.versions)
          .where(and(eq(t.versions.id, vid), eq(t.versions.scriptId, s.id)));
        if (!v) return fail(404, "NOT_FOUND", "Version not found.");
        return ok(v);
      }
      return ok(await versionFor(s.id, s.revision));
    }
    if (!u) return fail(401, "UNAUTHORIZED", "Sign in to continue.");
    if (action === "ratings" && method === "POST") {
      const input = await body(
        req,
        z.object({ score: z.number().int().min(1).max(5) }).strict(),
      );
      if (s.ownerId === u.id)
        fail(403, "FORBIDDEN", "Authors cannot rate their own scripts.");
      const [entry] = await current()
        .select()
        .from(t.library)
        .where(and(eq(t.library.userId, u.id), eq(t.library.scriptId, s.id)));
      if (!entry)
        fail(403, "INSTALL_REQUIRED", "Install the script before rating it.");
      await current()
        .insert(t.ratings)
        .values({ userId: u.id, scriptId: s.id, score: input.score })
        .onConflictDoUpdate({
          target: [t.ratings.userId, t.ratings.scriptId],
          set: { score: input.score },
        });
      return ok({ rated: true });
    }
    owned(s.ownerId, u.id);
    if (action === "versions" && method === "POST") {
      const input = await body(req, versionInput);
      const details = {
        visibility: input.visibility,
        category: input.category,
        tags: input.tags,
        screenshots: input.screenshots,
      };
      let meta;
      try {
        meta = validateSource(input.source);
      } catch (e) {
        return fail(400, "INVALID_METADATA", (e as Error).message);
      }
      const vid = id();
      await current().transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(t.scripts)
          .where(eq(t.scripts.id, s.id))
          .for("update");
        if (locked.revision !== input.expectedRevision)
          return fail(
            409,
            "STALE_VERSION",
            "A newer version exists. Reload before saving.",
          );
        const [old] = await tx
          .select()
          .from(t.versions)
          .where(
            and(
              eq(t.versions.scriptId, s.id),
              eq(t.versions.revision, locked.revision),
            ),
          );
        if (!valid(meta.version[0]) || !gt(meta.version[0], old.version))
          return fail(
            409,
            "VERSION_MUST_INCREASE",
            "Increase @version before saving a new immutable version.",
          );
        await tx.insert(t.versions).values({
          id: vid,
          scriptId: s.id,
          revision: locked.revision + 1,
          version: meta.version[0],
          source: input.source,
          changelog: input.changelog,
        });
        await tx
          .insert(t.metadata)
          .values({ versionId: vid, directives: { ...meta } });
        await tx
          .update(t.scripts)
          .set({
            ...details,
            revision: locked.revision + 1,
            name: meta.name[0],
            description: meta.description?.[0] ?? "",
            updatedAt: new Date(),
          })
          .where(eq(t.scripts.id, s.id));
        await tx
          .update(t.library)
          .set({ versionId: vid, enabled: false })
          .where(and(eq(t.library.userId, u.id), eq(t.library.scriptId, s.id)));
        await tx.insert(t.auditLogs).values({
          id: id(),
          userId: u.id,
          action: "script.versioned",
          resourceId: s.id,
        });
      });
      return ok(await versionFor(s.id), 201);
    }
    if (!action && method === "PATCH") {
      const { expectedRevision, ...input } = await body(req, scriptPatch);
      const [updated] = await current()
        .update(t.scripts)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(t.scripts.id, s.id), eq(t.scripts.revision, expectedRevision)),
        )
        .returning();
      if (!updated)
        fail(409, "STALE_VERSION", "Script changed. Reload before saving.");
      await audit(u.id, "script.updated", s.id);
      return ok(updated);
    }
    if (!action && method === "DELETE") {
      await current().delete(t.scripts).where(eq(t.scripts.id, s.id));
      await audit(u.id, "script.deleted", s.id);
      return ok({ deleted: true });
    }
  }
  if (resource === "library") {
    const u = await identity(req);
    if (!identifier && method === "GET")
      return ok(
        (await libraryFor(u.id)).map((entry) => ({
          ...entry,
          compatibility: analyzeCompatibility(entry.metadata, entry.source),
        })),
      );
    if (identifier === "install" && method === "POST") {
      const input = await body(
        req,
        z
          .object({
            scriptId: z.string(),
            versionId: z.string(),
            confirmed: z.literal(true),
          })
          .strict(),
      );
      const s = await scriptFor(input.scriptId, u.id);
      const [v] = await current()
        .select()
        .from(t.versions)
        .where(
          and(
            eq(t.versions.id, input.versionId),
            eq(t.versions.scriptId, s.id),
          ),
        );
      if (!v) return fail(404, "NOT_FOUND", "Version not found.");
      await current().transaction(async (tx) => {
        await tx
          .insert(t.library)
          .values({ id: id(), userId: u.id, scriptId: s.id, versionId: v.id })
          .onConflictDoNothing();
        await tx
          .insert(t.installations)
          .values({ id: id(), userId: u.id, scriptId: s.id })
          .onConflictDoNothing();
        await tx.insert(t.auditLogs).values({
          id: id(),
          userId: u.id,
          action: "library.installed",
          resourceId: s.id,
        });
      });
      const [installed] = await current()
        .select()
        .from(t.library)
        .where(and(eq(t.library.userId, u.id), eq(t.library.scriptId, s.id)));
      return ok(
        {
          installed: true,
          enabled: installed.enabled,
          versionId: installed.versionId,
        },
        201,
      );
    }
    if (identifier === "uninstall" && method === "DELETE") {
      const { scriptId } = await body(
        req,
        z.object({ scriptId: z.string() }).strict(),
      );
      await current()
        .delete(t.library)
        .where(
          and(eq(t.library.userId, u.id), eq(t.library.scriptId, scriptId)),
        );
      await audit(u.id, "library.uninstalled", scriptId);
      return ok({ uninstalled: true });
    }
    const [entry] = await current()
      .select()
      .from(t.library)
      .where(and(eq(t.library.id, identifier), eq(t.library.userId, u.id)));
    if (!entry) return fail(404, "NOT_FOUND", "Library entry not found.");
    if (method === "PATCH") {
      const { confirmed, ...input } = await body(req, libraryPatch);
      if (input.versionId) {
        if (!confirmed)
          fail(
            400,
            "CONFIRMATION_REQUIRED",
            "Review the source and confirm the update.",
          );
        await scriptFor(entry.scriptId, u.id);
        const [v] = await current()
          .select()
          .from(t.versions)
          .where(
            and(
              eq(t.versions.id, input.versionId),
              eq(t.versions.scriptId, entry.scriptId),
            ),
          );
        if (!v)
          fail(400, "INVALID_VERSION", "Version must belong to this script.");
        input.enabled = false;
      }
      if (input.enabled) {
        await scriptFor(entry.scriptId, u.id);
        const [installed] = await current()
          .select()
          .from(t.versions)
          .where(eq(t.versions.id, entry.versionId));
        const v = {
          compatibility: analyzeCompatibility(
            parseMetadata(installed.source),
            installed.source,
          ),
        };
        if (!v.compatibility.supported)
          fail(
            400,
            "INCOMPATIBLE",
            "Resolve unsupported permissions before enabling this script.",
          );
      }
      const [updated] = await current()
        .update(t.library)
        .set(input)
        .where(eq(t.library.id, entry.id))
        .returning();
      return ok(updated);
    }
  }
  if (resource === "collections") {
    const u = await identity(req);
    if (!identifier && method === "GET") {
      const result = await current()
        .select()
        .from(t.collections)
        .where(eq(t.collections.userId, u.id))
        .orderBy(asc(t.collections.name));
      const entries = await current()
        .select({
          collectionId: t.collectionEntries.collectionId,
          libraryId: t.collectionEntries.libraryId,
        })
        .from(t.collectionEntries)
        .innerJoin(
          t.collections,
          eq(t.collections.id, t.collectionEntries.collectionId),
        )
        .where(eq(t.collections.userId, u.id));
      return ok(
        result.map((c) => ({
          ...c,
          entries: entries
            .filter((e) => e.collectionId === c.id)
            .map((e) => e.libraryId),
        })),
      );
    }
    if (!identifier && method === "POST") {
      const input = await body(
        req,
        z.object({ name: z.string().trim().min(1).max(80) }).strict(),
      );
      const [c] = await current()
        .insert(t.collections)
        .values({ id: id(), userId: u.id, name: input.name })
        .returning();
      return ok(c, 201);
    }
    const [c] = await current()
      .select()
      .from(t.collections)
      .where(eq(t.collections.id, identifier));
    if (!c) return fail(404, "NOT_FOUND", "Collection not found.");
    owned(c.userId, u.id);
    if (!action && method === "DELETE") {
      await current().delete(t.collections).where(eq(t.collections.id, c.id));
      return ok({ deleted: true });
    }
    if (!action && method === "PATCH") {
      const input = await body(
        req,
        z.object({ name: z.string().min(1).max(80) }).strict(),
      );
      await current()
        .update(t.collections)
        .set(input)
        .where(eq(t.collections.id, c.id));
      return ok({ updated: true });
    }
    if (action === "entries" && ["POST", "DELETE"].includes(method)) {
      const { libraryId } = await body(
        req,
        z.object({ libraryId: z.string() }).strict(),
      );
      const [l] = await current()
        .select()
        .from(t.library)
        .where(and(eq(t.library.id, libraryId), eq(t.library.userId, u.id)));
      if (!l) return fail(404, "NOT_FOUND", "Library entry not found.");
      if (method === "POST")
        await current()
          .insert(t.collectionEntries)
          .values({ collectionId: c.id, libraryId })
          .onConflictDoNothing();
      else
        await current()
          .delete(t.collectionEntries)
          .where(
            and(
              eq(t.collectionEntries.collectionId, c.id),
              eq(t.collectionEntries.libraryId, libraryId),
            ),
          );
      return ok({ updated: true });
    }
  }
  if (resource === "users") {
    if (identifier === "me") {
      const u = await identity(req);
      if (action === "scripts" && method === "GET")
        return ok(
          await current()
            .select()
            .from(t.scripts)
            .where(eq(t.scripts.ownerId, u.id))
            .orderBy(desc(t.scripts.updatedAt)),
        );
      if (!action && method === "GET")
        return ok({
          id: u.id,
          name: u.name,
          email: u.email,
          username: u.username,
          bio: u.bio,
          admin: isAdmin(u.id),
        });
      if (!action && method === "PATCH") {
        const input = await body(req, profileInput);
        await current()
          .update(t.user)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(t.user.id, u.id));
        return ok(input);
      }
    }
    const [author] = await current()
      .select({
        id: t.user.id,
        name: t.user.name,
        username: t.user.username,
        bio: t.user.bio,
      })
      .from(t.user)
      .where(and(eq(t.user.username, identifier), eq(t.user.suspended, false)));
    if (!author) return fail(404, "NOT_FOUND", "Author not found.");
    if (action === "scripts" && method === "GET")
      return listRegistry(req, "latest", author.id);
    if (!action && method === "GET") {
      const [followers] = await current()
        .select({ count: count() })
        .from(t.follows)
        .where(eq(t.follows.authorId, author.id));
      return ok({ ...author, followers: followers.count });
    }
    if (action === "follow" && ["POST", "DELETE"].includes(method)) {
      const u = await identity(req);
      if (u.id === author.id)
        fail(400, "SELF_FOLLOW", "You cannot follow yourself.");
      if (method === "POST")
        await current()
          .insert(t.follows)
          .values({ followerId: u.id, authorId: author.id })
          .onConflictDoNothing();
      else
        await current()
          .delete(t.follows)
          .where(
            and(
              eq(t.follows.followerId, u.id),
              eq(t.follows.authorId, author.id),
            ),
          );
      return ok({ following: method === "POST" });
    }
  }
  if (resource === "reports" && method === "POST") {
    const u = await identity(req);
    const input = await body(
      req,
      z
        .object({
          scriptId: z.string(),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict(),
    );
    await scriptFor(input.scriptId, u.id);
    const [r] = await current()
      .insert(t.reports)
      .values({ id: id(), userId: u.id, ...input })
      .returning();
    await audit(u.id, "script.reported", input.scriptId);
    return ok(r, 201);
  }
  if (resource === "activity" && method === "GET") {
    const u = await identity(req);
    const p = pagination.parse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    return ok(
      await current()
        .select()
        .from(t.auditLogs)
        .where(eq(t.auditLogs.userId, u.id))
        .orderBy(desc(t.auditLogs.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit),
    );
  }
  if (resource === "import" && method === "POST") {
    await identity(req);
    const input = await body(
      req,
      z.object({ url: z.url().max(2000), confirmed: z.literal(true) }).strict(),
    );
    let source;
    try {
      source = await importUrl(input.url);
      return ok({ source, metadata: validateSource(source) });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      return fail(400, "IMPORT_FAILED", (e as Error).message);
    }
  }
  if (resource === "launcher") {
    const u = await identity(req);
    if (identifier === "authorizations" && method === "GET")
      return ok(
        await current()
          .select({
            id: t.launcherAuthorizations.id,
            origin: t.launcherAuthorizations.origin,
            expiresAt: t.launcherAuthorizations.expiresAt,
            createdAt: t.launcherAuthorizations.createdAt,
          })
          .from(t.launcherAuthorizations)
          .where(eq(t.launcherAuthorizations.userId, u.id))
          .orderBy(desc(t.launcherAuthorizations.createdAt)),
      );
    if (identifier === "authorizations" && method === "POST") {
      const input = await body(
        req,
        z.object({ origin: z.url(), confirmed: z.literal(true) }).strict(),
      );
      const target = new URL(input.origin);
      if (
        !["http:", "https:"].includes(target.protocol) ||
        target.origin !== input.origin ||
        target.origin === origin()
      )
        fail(400, "INVALID_ORIGIN", "Choose a third-party HTTP(S) origin.");
      const [a] = await current()
        .insert(t.launcherAuthorizations)
        .values({
          id: id(),
          userId: u.id,
          sessionId: u.sessionId,
          origin: target.origin,
          expiresAt: new Date(Date.now() + 15 * 60000),
        })
        .returning();
      return ok({ id: a.id, expiresAt: a.expiresAt, origin: a.origin }, 201);
    }
    if (identifier === "authorizations" && action && method === "DELETE") {
      await current()
        .delete(t.launcherAuthorizations)
        .where(
          and(
            eq(t.launcherAuthorizations.id, action),
            eq(t.launcherAuthorizations.userId, u.id),
          ),
        );
      return ok({ revoked: true });
    }
    if (identifier === "bridge" && method === "POST") {
      const input = await body(
        req,
        z
          .object({
            authorizationId: z.string(),
            origin: z.string(),
            operation: z.enum(["library", "prepare", "toggle", "storage"]),
            href: z.url().max(10000).optional(),
            versionId: z.string().optional(),
            entryId: z.string().optional(),
            enabled: z.boolean().optional(),
            settings: libraryPatch.shape.settings,
          })
          .strict(),
      );
      const [a] = await current()
        .select()
        .from(t.launcherAuthorizations)
        .where(
          and(
            eq(t.launcherAuthorizations.id, input.authorizationId),
            eq(t.launcherAuthorizations.userId, u.id),
            eq(t.launcherAuthorizations.sessionId, u.sessionId),
            eq(t.launcherAuthorizations.origin, input.origin),
            gte(t.launcherAuthorizations.expiresAt, new Date()),
          ),
        );
      if (!a)
        return fail(
          401,
          "AUTHORIZATION_EXPIRED",
          "Authorization expired or revoked. Link again.",
        );
      if (input.operation === "library")
        return ok(
          (await libraryFor(u.id)).map((e) => ({
            ...e,
            compatibility: analyzeCompatibility(e.metadata, e.source),
          })),
        );
      const entries = await libraryFor(u.id);
      const e = entries.find((l) => l.id === input.entryId);
      if (!e) return fail(404, "NOT_FOUND", "Entry unavailable.");
      if (input.operation === "prepare") {
        if (!input.href || new URL(input.href).origin !== a.origin)
          fail(
            400,
            "ORIGIN_REJECTED",
            "The page URL must belong to the approved origin.",
          );
        if (!e.enabled)
          fail(
            403,
            "SCRIPT_DISABLED",
            "This script is disabled. Refresh your library.",
          );
        if (input.versionId !== e.versionId)
          fail(
            409,
            "VERSION_CHANGED",
            "Your installed version changed. Refresh and review source again.",
          );
        if (!matchesUrl(e.metadata, input.href))
          fail(400, "URL_MISMATCH", "This script does not match the page URL.");
        const compatibility = analyzeCompatibility(e.metadata, e.source);
        if (!compatibility.supported)
          fail(400, "INCOMPATIBLE", "Script has unsupported APIs.");
        return ok({ ...e, compatibility });
      }
      if (input.operation === "toggle") {
        if (typeof input.enabled !== "boolean")
          fail(400, "INVALID_INPUT", "enabled is required.");
        if (
          input.enabled &&
          !analyzeCompatibility(e.metadata, e.source).supported
        )
          fail(400, "INCOMPATIBLE", "Script has unsupported APIs.");
        await current()
          .update(t.library)
          .set({ enabled: input.enabled })
          .where(eq(t.library.id, e.id));
        return ok({ enabled: input.enabled });
      }
      if (!input.settings) fail(400, "INVALID_INPUT", "settings is required.");
      await current()
        .update(t.library)
        .set({ settings: input.settings })
        .where(eq(t.library.id, e.id));
      return ok({ saved: true });
    }
  }
  if (resource === "admin") {
    const u = await admin(req);
    if (identifier === "reports" && method === "GET")
      return ok(
        await current()
          .select({
            id: t.reports.id,
            reason: t.reports.reason,
            resolved: t.reports.resolved,
            createdAt: t.reports.createdAt,
            scriptId: t.scripts.id,
            name: t.scripts.name,
            slug: t.scripts.slug,
            hidden: t.scripts.hidden,
            ownerId: t.scripts.ownerId,
            suspended: t.user.suspended,
          })
          .from(t.reports)
          .innerJoin(t.scripts, eq(t.scripts.id, t.reports.scriptId))
          .innerJoin(t.user, eq(t.user.id, t.scripts.ownerId))
          .orderBy(asc(t.reports.resolved), desc(t.reports.createdAt))
          .limit(100),
      );
    if (identifier === "scripts" && action && method === "PATCH") {
      const { hidden } = await body(
        req,
        z.object({ hidden: z.boolean() }).strict(),
      );
      await current()
        .update(t.scripts)
        .set({ hidden })
        .where(eq(t.scripts.id, action));
      await audit(
        u.id,
        hidden ? "moderation.hidden" : "moderation.restored",
        action,
      );
      return ok({ hidden });
    }
    if (identifier === "users" && action && method === "PATCH") {
      const { suspended } = await body(
        req,
        z.object({ suspended: z.boolean() }).strict(),
      );
      if (action === u.id)
        fail(400, "SELF_SUSPEND", "Cannot suspend yourself.");
      await current().transaction(async (tx) => {
        await tx.update(t.user).set({ suspended }).where(eq(t.user.id, action));
        if (suspended) {
          await tx.delete(t.session).where(eq(t.session.userId, action));
          await tx
            .delete(t.launcherAuthorizations)
            .where(eq(t.launcherAuthorizations.userId, action));
        }
      });
      await audit(
        u.id,
        suspended ? "moderation.suspended" : "moderation.restored-user",
        action,
      );
      return ok({ suspended });
    }
    if (identifier === "reports" && action && method === "PATCH") {
      const { resolved } = await body(
        req,
        z.object({ resolved: z.boolean() }).strict(),
      );
      await current()
        .update(t.reports)
        .set({ resolved })
        .where(eq(t.reports.id, action));
      await audit(u.id, "moderation.report-reviewed", action);
      return ok({ resolved });
    }
  }
  return fail(404, "NOT_FOUND", "Endpoint not found.");
}
