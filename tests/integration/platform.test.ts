import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { route } from "@/lib/service";
import { auth } from "@/lib/auth";
import { template } from "@/lib/userscript";
import { assertMutationOrigin, errorResponse, limit } from "@/lib/http";
let pool: Pool;
let alice = "",
  bob = "",
  aliceId = "",
  bobId = "",
  aliceSession = "";
let scriptId = "",
  versionId = "",
  entryId = "";
let revision = 1;
const base = "http://localhost:3000";
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  headers: Record<string, string> = {},
) {
  const req = new Request(base + "/api/" + path, {
    method,
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let res: Response;
  try {
    if (method !== "GET") assertMutationOrigin(req);
    res = await route(req, path.split("?")[0].split("/"));
  } catch (e) {
    res = errorResponse(e);
  }
  return { status: res.status, json: await res.json() };
}
async function signup(name: string, email: string) {
  const res = await auth().handler(
    new Request(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password: "test-password-for-fixtures-123",
      }),
    }),
  );
  const cookies = res.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return { cookies, id: body.user.id };
}
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "Set TEST_DATABASE_URL to a disposable database. Integration tests delete data.",
    );
  if (url === process.env.DATABASE_URL)
    throw new Error("TEST_DATABASE_URL must be separate from DATABASE_URL.");
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_URL = base;
  process.env.BETTER_AUTH_SECRET =
    "integration-only-secret-never-use-in-production-123456";
  pool = new Pool({ connectionString: url, max: 2 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.query("TRUNCATE users, api_rate_limits, auth_rate_limits CASCADE");
  const a = await signup("Alice", "alice@example.test"),
    b = await signup("Bob", "bob@example.test");
  alice = a.cookies;
  bob = b.cookies;
  aliceId = a.id;
  bobId = b.id;
  const session = await auth().api.getSession({
    headers: new Headers({ cookie: alice }),
  });
  aliceSession = session!.session.id;
});
afterAll(async () => {
  if (pool) {
    await pool.query(
      "TRUNCATE users, api_rate_limits, auth_rate_limits CASCADE",
    );
    await pool.end();
  }
});
describe("real PostgreSQL platform lifecycle", () => {
  it("authenticates sessions and rejects wrong passwords", async () => {
    expect(
      (await request("users/me", "GET", undefined, alice)).json.data.id,
    ).toBe(aliceId);
    expect((await request("users/me")).status).toBe(401);
    const res = await auth().handler(
      new Request(base + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin: base, "content-type": "application/json" },
        body: JSON.stringify({
          email: "alice@example.test",
          password: "wrong-password",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
  it("creates a private script, immutable source, and disabled personal entry", async () => {
    const r = await request("scripts", "POST", { source: template }, alice);
    expect(r.status).toBe(201);
    scriptId = r.json.data.id;
    const s = await request(`scripts/${scriptId}`, "GET", undefined, alice);
    versionId = s.json.data.current.id;
    const l = await request("library", "GET", undefined, alice);
    expect(l.json.data[0].enabled).toBe(false);
    entryId = l.json.data[0].id;
    expect(
      (await request(`scripts/${scriptId}`, "GET", undefined, bob)).status,
    ).toBe(404);
    expect((await request("scripts")).json.meta.total).toBe(0);
  });
  it("enforces ownership, CSRF, and input validation", async () => {
    expect(
      (
        await request(
          `scripts/${scriptId}`,
          "PATCH",
          { visibility: "public", expectedRevision: 1 },
          bob,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `scripts/${scriptId}`,
          "PATCH",
          { visibility: "public", expectedRevision: 1 },
          alice,
          { origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "scripts",
          "POST",
          { source: template, ownerId: bobId },
          alice,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("scripts", "POST", { source: "bad" }, alice)).status,
    ).toBe(400);
  });
  it("Packed Mode authenticates, checks ownership and immutable versions, and packages without execution", async () => {
    expect((await request("packed/scripts")).status).toBe(401);
    const candidates = (
      await request("packed/scripts", "GET", undefined, alice)
    ).json.data;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].owned).toBe(true);
    const input = {
      selections: [
        { id: candidates[0].id, versionId: candidates[0].versionId },
      ],
    };
    expect((await request("packed/build", "POST", input)).status).toBe(401);
    expect((await request("packed/build", "POST", input, bob)).status).toBe(
      404,
    );
    expect(
      (
        await request("packed/build", "POST", input, alice, {
          origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "packed/build",
          "POST",
          {
            ...input,
            selections: [{ id: candidates[0].id, versionId: "stale" }],
          },
          alice,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "packed/build",
          "POST",
          { ...input, settings: { token: "untrusted" } },
          alice,
        )
      ).status,
    ).toBe(400);
    const output = await request("packed/build", "POST", input, alice);
    expect(output.status).toBe(200);
    expect(output.json.data.manifest.scripts[0].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.json.data.bookmarklet).toMatch(/^javascript:/);
    expect(output.json.data.code).not.toContain(aliceSession);
    expect(output.json.data.code).not.toContain(alice);
    expect(output.json.data.manifest.scripts[0]).not.toHaveProperty("settings");
  });
  it("rejects invalid syntax, empty entry patches, and unconfirmed/unsafe URL imports", async () => {
    expect(
      (
        await request(
          "scripts",
          "POST",
          { source: template + "\nconst bad = ;" },
          alice,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request(`library/${entryId}`, "PATCH", {}, alice)).status,
    ).toBe(400);
    expect(
      (
        await request(
          "import",
          "POST",
          { url: "https://example.com/a.user.js" },
          alice,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "import",
          "POST",
          { url: "https://127.0.0.1/a.user.js", confirmed: true },
          alice,
        )
      ).status,
    ).toBe(400);
  });
  it("supports unlisted direct links without public discovery", async () => {
    expect(
      (
        await request(
          `scripts/${scriptId}`,
          "PATCH",
          { visibility: "unlisted", expectedRevision: 1 },
          alice,
        )
      ).status,
    ).toBe(200);
    expect((await request(`scripts/${scriptId}`)).status).toBe(200);
    expect((await request("registry/search")).json.meta.total).toBe(0);
  });
  it("publishes and records one installation per user; installations remain disabled", async () => {
    await request(
      `scripts/${scriptId}`,
      "PATCH",
      { visibility: "public", expectedRevision: 1 },
      alice,
    );
    expect((await request("registry/search")).json.meta.total).toBe(1);
    expect(
      (await request("library/install", "POST", { scriptId, versionId }, bob))
        .status,
    ).toBe(400);
    for (let n = 0; n < 3; n++)
      expect(
        (
          await request(
            "library/install",
            "POST",
            { scriptId, versionId, confirmed: true },
            bob,
          )
        ).status,
      ).toBe(201);
    expect((await request(`scripts/${scriptId}`)).json.data.installs).toBe(1);
    expect(
      (await request("library", "GET", undefined, bob)).json.data[0].enabled,
    ).toBe(false);
    const candidates = (await request("packed/scripts", "GET", undefined, bob))
      .json.data;
    const input = {
      selections: [
        { id: candidates[0].id, versionId: candidates[0].versionId },
      ],
    };
    expect((await request("packed/build", "POST", input, bob)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          "packed/build",
          "POST",
          { ...input, communityApproved: true },
          bob,
        )
      ).status,
    ).toBe(200);
  });
  it("version checks reject stale edits and version reuse", async () => {
    const r = await request(
      `scripts/${scriptId}/versions`,
      "POST",
      {
        source: template.replace("1.0.0", "1.1.0"),
        expectedRevision: revision,
        changelog: "Improve fixture",
      },
      alice,
    );
    expect(r.status).toBe(201);
    revision = 2;
    expect(
      (
        await request(
          `scripts/${scriptId}/versions`,
          "POST",
          { source: template.replace("1.0.0", "1.2.0"), expectedRevision: 1 },
          alice,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `scripts/${scriptId}/versions`,
          "POST",
          { source: template.replace("1.0.0", "1.1.0"), expectedRevision: 2 },
          alice,
        )
      ).status,
    ).toBe(409);
    expect(
      (await request(`scripts/${scriptId}/versions`)).json.data,
    ).toHaveLength(2);
    expect(
      (await request("library", "GET", undefined, bob)).json.data[0].version,
    ).toBe("1.0.0");
  });
  it("serializes competing saves and validates metadata before committing a version", async () => {
    const attempts = await Promise.all(
      ["1.2.0", "1.3.0"].map((version) =>
        request(
          `scripts/${scriptId}/versions`,
          "POST",
          { source: template.replace("1.0.0", version), expectedRevision: 2 },
          alice,
        ),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    const before = (await request(`scripts/${scriptId}`)).json.data;
    expect(before.revision).toBe(3);
    expect(
      (
        await request(
          `scripts/${scriptId}/versions`,
          "POST",
          {
            source: template.replace("1.0.0", "2.0.0"),
            expectedRevision: 3,
            screenshots: ["http://unsafe.test/image.png"],
          },
          alice,
        )
      ).status,
    ).toBe(400);
    expect((await request(`scripts/${scriptId}`)).json.data.revision).toBe(3);
  });
  it("Packed regeneration reviews latest versions without changing the installed version", async () => {
    const original = (await request("packed/scripts", "GET", undefined, bob))
      .json.data[0];
    const latest = (
      await request("packed/scripts?latest=true", "GET", undefined, bob)
    ).json.data[0];
    expect(latest.versionId).not.toBe(original.versionId);
    const output = await request(
      "packed/build",
      "POST",
      {
        selections: [{ id: latest.id, versionId: latest.versionId }],
        latest: true,
        communityApproved: true,
      },
      bob,
    );
    expect(output.status).toBe(200);
    expect(output.json.data.manifest.scripts[0].versionId).toBe(
      latest.versionId,
    );
    expect(
      (await request("library", "GET", undefined, bob)).json.data[0].versionId,
    ).toBe(original.versionId);
  });
  it("updates require review and disable the installed script", async () => {
    const s = (await request(`scripts/${scriptId}`)).json.data;
    const b = (await request("library", "GET", undefined, bob)).json.data[0];
    expect(
      (await request(`library/${b.id}`, "PATCH", { enabled: true }, bob))
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          `library/${b.id}`,
          "PATCH",
          { versionId: s.current.id },
          bob,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `library/${b.id}`,
          "PATCH",
          { versionId: s.current.id, confirmed: true },
          bob,
        )
      ).json.data.enabled,
    ).toBe(false);
    expect(
      (await request(`library/${b.id}`, "PATCH", { enabled: true }, alice))
        .status,
    ).toBe(404);
  });
  it("collections reject entries belonging to other users", async () => {
    const c = (await request("collections", "POST", { name: "Work" }, alice))
      .json.data;
    const b = (await request("library", "GET", undefined, bob)).json.data[0];
    expect(
      (
        await request(
          `collections/${c.id}/entries`,
          "POST",
          { libraryId: b.id },
          alice,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `collections/${c.id}/entries`,
          "POST",
          { libraryId: entryId },
          alice,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`collections/${c.id}`, "DELETE", undefined, bob)).status,
    ).toBe(403);
    expect(
      (await request("collections", "GET", undefined, alice)).json.data[0]
        .entries,
    ).toEqual([entryId]);
  });
  it("launcher authorizations are origin-bound, user-bound, session-bound and revocable", async () => {
    expect(
      (
        await request(
          "launcher/authorizations",
          "POST",
          { origin: base, confirmed: true },
          alice,
        )
      ).status,
    ).toBe(400);
    const a = (
      await request(
        "launcher/authorizations",
        "POST",
        { origin: "https://example.com", confirmed: true },
        alice,
      )
    ).json.data;
    const input = {
      authorizationId: a.id,
      origin: "https://example.com",
      operation: "library",
    };
    expect(
      (await request("launcher/bridge", "POST", input, alice)).status,
    ).toBe(200);
    expect((await request("launcher/bridge", "POST", input, bob)).status).toBe(
      401,
    );
    expect(
      (
        await request(
          "launcher/bridge",
          "POST",
          { ...input, origin: "https://evil.test" },
          alice,
        )
      ).status,
    ).toBe(401);
    const entry = (await request("library", "GET", undefined, alice)).json
      .data[0];
    const prepare = {
      ...input,
      operation: "prepare",
      entryId: entry.id,
      versionId: entry.versionId,
      href: "https://example.com/path",
    };
    expect(
      (await request("launcher/bridge", "POST", prepare, alice)).status,
    ).toBe(403);
    await request(`library/${entry.id}`, "PATCH", { enabled: true }, alice);
    expect(
      (await request("launcher/bridge", "POST", prepare, alice)).status,
    ).toBe(200);
    expect(
      (
        await request(
          "launcher/bridge",
          "POST",
          { ...prepare, href: "https://evil.test/" },
          alice,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "launcher/bridge",
          "POST",
          { ...prepare, versionId: "stale" },
          alice,
        )
      ).status,
    ).toBe(409);
    await pool.query(
      "update launcher_authorizations set expires_at=now()-interval '1 second' where id=$1",
      [a.id],
    );
    expect(
      (await request("launcher/bridge", "POST", input, alice)).status,
    ).toBe(401);
    await request(
      `launcher/authorizations/${a.id}`,
      "DELETE",
      undefined,
      alice,
    );
    expect(
      (await request("launcher/bridge", "POST", input, alice)).status,
    ).toBe(401);
  });
  it("ratings require installs; reporting and moderation protect access", async () => {
    expect(
      (
        await request(
          `scripts/${scriptId}/ratings`,
          "POST",
          { score: 5 },
          alice,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request(`scripts/${scriptId}/ratings`, "POST", { score: 5 }, bob))
        .status,
    ).toBe(200);
    expect((await request(`scripts/${scriptId}`)).json.data.rating).toBe(5);
    const r = await request(
      "reports",
      "POST",
      { scriptId, reason: "This is a test report for moderation." },
      bob,
    );
    expect(r.status).toBe(201);
    expect((await request("admin/reports", "GET", undefined, bob)).status).toBe(
      403,
    );
    process.env.ADMIN_USER_IDS = aliceId;
    expect(
      (await request("admin/reports", "GET", undefined, alice)).json.data,
    ).toHaveLength(1);
    await request(
      `admin/scripts/${scriptId}`,
      "PATCH",
      { hidden: true },
      alice,
    );
    expect(
      (await request(`scripts/${scriptId}`, "GET", undefined, bob)).status,
    ).toBe(404);
    expect(
      (await request("library", "GET", undefined, bob)).json.data,
    ).toHaveLength(0);
    expect(
      (await request("packed/scripts", "GET", undefined, bob)).json.data,
    ).toHaveLength(0);
    await request(
      `admin/scripts/${scriptId}`,
      "PATCH",
      { hidden: false },
      alice,
    );
  });
  it("uninstall does not inflate lifetime counters and removed entries cannot run", async () => {
    await request("library/uninstall", "DELETE", { scriptId }, bob);
    expect(
      (await request("library", "GET", undefined, bob)).json.data,
    ).toHaveLength(0);
    expect((await request(`scripts/${scriptId}`)).json.data.installs).toBe(1);
  });
  it("database rejects mutation of immutable source and metadata", async () => {
    const s = (await request(`scripts/${scriptId}`)).json.data;
    await expect(
      pool.query("update script_versions set source='tampered' where id=$1", [
        s.current.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "update script_metadata set directives='{}' where version_id=$1",
        [s.current.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("author listings survive uninstalling their own script", async () => {
    await request("library/uninstall", "DELETE", { scriptId }, alice);
    expect(
      (await request("users/me/scripts", "GET", undefined, alice)).json.data,
    ).toHaveLength(1);
    const candidate = (await request("packed/scripts", "GET", undefined, alice))
      .json.data[0];
    expect(candidate.id).toBe("owned:" + scriptId);
    expect(
      (
        await request(
          "packed/build",
          "POST",
          {
            selections: [{ id: candidate.id, versionId: candidate.versionId }],
          },
          alice,
        )
      ).status,
    ).toBe(200);
  });
  it("rate limiting persists across requests", async () => {
    const req = new Request(base + "/api/library", { method: "POST" });
    for (let n = 0; n < 40; n++) await limit(req, "ratelimit-fixture");
    await expect(limit(req, "ratelimit-fixture")).rejects.toMatchObject({
      status: 429,
    });
  });
  it("suspension revokes sessions and cascade deletion removes private relationships", async () => {
    await request(`admin/users/${bobId}`, "PATCH", { suspended: true }, alice);
    expect((await request("users/me", "GET", undefined, bob)).status).toBe(401);
    expect(
      (await request(`scripts/${scriptId}`, "DELETE", undefined, alice)).status,
    ).toBe(200);
    expect((await request(`scripts/${scriptId}`)).status).toBe(404);
    const r = await pool.query(
      "select count(*)::int as n from script_versions where script_id=$1",
      [scriptId],
    );
    expect(r.rows[0].n).toBe(0);
    expect(aliceSession).toBeTruthy();
  });
});
