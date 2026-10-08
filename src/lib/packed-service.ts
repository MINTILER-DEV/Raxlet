import { and, desc, eq, inArray } from "drizzle-orm";
import { database } from "@/db";
import * as t from "@/db/schema";
import { body, fail, identity, ok, origin } from "./http";
import { libraryFor } from "./service";
import {
  buildPacked,
  dependencyList,
  packedRequestSchema,
  packedRuntimeSizes,
} from "./packed-build";
import { packedCompatibility } from "./packed-compatibility";
import type { PackedCandidate } from "./packed-types";
import { importUrl } from "./import-url";
import { validateSource } from "./source";

export async function packedCandidates(
  uid: string,
  latest = false,
): Promise<PackedCandidate[]> {
  const installed = await libraryFor(uid);
  const own = await database()
    .select()
    .from(t.scripts)
    .where(eq(t.scripts.ownerId, uid));
  const scriptIds = [
    ...new Set([...installed.map((s) => s.scriptId), ...own.map((s) => s.id)]),
  ];
  if (!scriptIds.length) return [];
  const versions = await database()
    .selectDistinctOn([t.versions.scriptId])
    .from(t.versions)
    .where(inArray(t.versions.scriptId, scriptIds))
    .orderBy(t.versions.scriptId, desc(t.versions.revision));
  const latestByScript = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!latestByScript.has(version.scriptId))
      latestByScript.set(version.scriptId, version);
  const categories = new Map(own.map((s) => [s.id, s.category]));
  const others = await database()
    .select({ id: t.scripts.id, category: t.scripts.category })
    .from(t.scripts)
    .where(and(inArray(t.scripts.id, scriptIds)));
  others.forEach((s) => categories.set(s.id, s.category));
  const records = [
    ...installed.map((s) => ({
      id: "library:" + s.id,
      scriptId: s.scriptId,
      owned: s.ownerId === uid,
      version: latest
        ? latestByScript.get(s.scriptId)!
        : { id: s.versionId, version: s.version, source: s.source },
    })),
    ...own
      .filter((s) => !installed.some((e) => e.scriptId === s.id))
      .map((s) => ({
        id: "owned:" + s.id,
        scriptId: s.id,
        owned: true,
        version: latestByScript.get(s.id)!,
      })),
  ];
  return records.map((record) => {
    const metadata = validateSource(record.version.source);
    const compatibility = packedCompatibility(metadata, record.version.source);
    let dependencies: string[] = [];
    try {
      const deps = dependencyList(metadata);
      dependencies = [
        ...deps.requires,
        ...deps.resources.map((r) => `${r.name}: ${r.url}`),
      ];
    } catch (error) {
      compatibility.blockers.push((error as Error).message);
      compatibility.supported = false;
    }
    return {
      id: record.id,
      scriptId: record.scriptId,
      owned: record.owned,
      versionId: record.version.id,
      version: record.version.version,
      name: metadata.name[0],
      description: metadata.description?.[0] ?? "",
      source: record.version.source,
      category: categories.get(record.scriptId) ?? "Utilities",
      metadata,
      bytes: Buffer.byteLength(record.version.source),
      compatibility,
      dependencies,
    };
  });
}
export async function packedRoute(req: Request, action?: string) {
  const user = await identity(req);
  if (req.method === "GET" && action === "runtime-size")
    return ok(await packedRuntimeSizes());
  if (req.method === "GET" && action === "scripts")
    return ok(
      await packedCandidates(
        user.id,
        new URL(req.url).searchParams.get("latest") === "true",
      ),
    );
  if (req.method === "POST" && action === "build") {
    const input = await body(req, packedRequestSchema);
    if (
      new Set(input.selections.map((s) => s.id)).size !==
      input.selections.length
    )
      return fail(400, "INVALID_SELECTION", "Select each script only once.");
    const current = await packedCandidates(user.id, input.latest);
    const selected = input.selections.map((selection) => {
      const candidate = current.find((c) => c.id === selection.id);
      if (!candidate)
        return fail(
          404,
          "NOT_FOUND",
          "A selected script is unavailable or does not belong to your library.",
        );
      if (candidate.versionId !== selection.versionId)
        return fail(
          409,
          "STALE_SELECTION",
          "Script versions changed. Reload the selection and review them again.",
        );
      return candidate;
    });
    try {
      return ok(await buildPacked(selected, input, origin(), importUrl));
    } catch (error) {
      return fail(400, "PACKED_BUILD_FAILED", (error as Error).message);
    }
  }
  return fail(404, "NOT_FOUND", "Packed Mode endpoint not found.");
}
