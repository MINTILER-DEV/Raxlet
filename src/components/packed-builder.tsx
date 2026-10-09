"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { loader } from "@monaco-editor/react";
import { Archive, Copy, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { api, authClient, mutation } from "@/lib/client";
import { encodeBookmarklet } from "@/lib/packed-codec";
import {
  packedDefaults,
  type PackedCandidate,
  type PackedOutput,
  type PackedSettings,
} from "@/lib/packed-types";
import type { Collection } from "@/lib/types";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { RequestState, useRemote } from "./workspace";
import { LauncherTabs } from "./launcher-tabs";
const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 400 }} />,
});
loader.config({ paths: { vs: "/monaco/vs" } });
type Profile = {
  id: string;
  name: string;
  selections: { id: string; versionId: string }[];
  settings: PackedSettings;
};
const size = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const estimatedScriptSize = (script: PackedCandidate) =>
  encodeURIComponent(
    script.source +
      JSON.stringify(script.metadata).repeat(2) +
      script.name +
      script.description,
  ).length + 1000;
export function PackedBuilder() {
  const { data: session } = authClient.useSession();
  const { data, error, loading, reload } =
    useRemote<PackedCandidate[]>("packed/scripts");
  const { data: collections } = useRemote<Collection[]>("collections");
  const { data: runtimeSize } = useRemote<{
    minified: number;
    unminified: number;
  }>("packed/runtime-size");
  const [selected, setSelected] = useState<string[]>([]);
  const [settings, setSettings] = useState<PackedSettings>({
    ...packedDefaults,
  });
  const [name, setName] = useState("Raxlet Packed");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [collection, setCollection] = useState("");
  const [community, setCommunity] = useState(false);
  const [dependencies, setDependencies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [output, setOutput] = useState<PackedOutput | null>(null);
  const [builtSignature, setBuiltSignature] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewLoader, setPreviewLoader] = useState(false);
  const [review, setReview] = useState<PackedCandidate | null>(null);
  const [confirmLatest, setConfirmLatest] = useState(false);
  const [latestSelection, setLatestSelection] = useState<PackedCandidate[]>([]);
  const [changes, setChanges] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileName, setProfileName] = useState("");
  const anchor = useRef<HTMLAnchorElement>(null);
  const profileKey = session?.user.id
    ? `raxlet-packed-profiles:${session.user.id}`
    : "";
  useEffect(() => {
    if (!profileKey) return;
    try {
      const stored = JSON.parse(localStorage.getItem(profileKey) ?? "[]");
      setProfiles(
        Array.isArray(stored)
          ? stored
              .filter(
                (p) =>
                  typeof p.name === "string" &&
                  Array.isArray(p.selections) &&
                  p.settings,
              )
              .slice(0, 20)
          : [],
      );
    } catch {
      setProfiles([]);
    }
  }, [profileKey]);
  useEffect(() => {
    if (anchor.current && output)
      anchor.current.setAttribute("href", output.bookmarklet);
  }, [output]);
  const scripts = data ?? [];
  const selection = scripts.filter((s) => selected.includes(s.id));
  const signature = JSON.stringify([name, settings, [...selected].sort()]);
  const estimatedTotal = runtimeSize
    ? (settings.minify ? runtimeSize.minified : runtimeSize.unminified) +
      selection.reduce((sum, script) => sum + estimatedScriptSize(script), 0) +
      1000
    : null;
  const shown = scripts.filter(
    (s) =>
      (s.name + " " + s.description)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!category || s.category === category) &&
      (!collection ||
        collections
          ?.find((c) => c.id === collection)
          ?.entries.some((id) => s.id === "library:" + id)),
  );
  const approved =
    (!selection.some((s) => !s.owned) || community) &&
    (!selection.some((s) => s.dependencies.length) || dependencies);
  function changeSelection(next: string[]) {
    setSelected(next);
    setCommunity(false);
    setDependencies(false);
  }
  async function generate(latest = false) {
    setBusy(true);
    setBuildError("");
    try {
      const result = await api<PackedOutput>(
        "packed/build",
        mutation("POST", {
          name,
          selections: (latest ? latestSelection : selection).map((s) => ({
            id: s.id,
            versionId: s.versionId,
          })),
          settings,
          communityApproved: community,
          dependenciesApproved: dependencies,
          latest,
        }),
      );
      setChanges(
        output
          ? result.manifest.scripts
              .filter(
                (s) =>
                  output.manifest.scripts.find(
                    (old) => old.scriptId === s.scriptId,
                  )?.hash !== s.hash ||
                  output.manifest.scripts
                    .find((old) => old.scriptId === s.scriptId)
                    ?.dependencies.some(
                      (d, index) => d.hash !== s.dependencies[index]?.hash,
                    ),
              )
              .map(
                (s) =>
                  `${s.name}: ${output.manifest.scripts.find((old) => old.scriptId === s.scriptId)?.version ?? "new"} → ${s.version}`,
              )
          : [],
      );
      setOutput(result);
      setBuiltSignature(signature);
      setConfirmLatest(false);
      toast.success("Packed bookmarklet generated");
    } catch (error) {
      setBuildError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveProfiles(next: Profile[]) {
    try {
      localStorage.setItem(profileKey, JSON.stringify(next));
      setProfiles(next);
    } catch {
      toast.error("Browser storage unavailable; profile was not saved.");
    }
  }
  return (
    <>
      <LauncherTabs packed />
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR LIBRARY, PACKED TO GO</div>
          <h1>Packed Mode</h1>
          <p>
            One bookmark. Your selected scripts and launcher, available offline.
          </p>
        </div>
        <Archive className="text-lime-400" size={32} />
      </div>
      <div className="alert mb-6">
        Packed Mode makes no account connection or runtime downloads. Included
        scripts can access the page and make their own requests. Packing does
        not bypass CSP or browser restrictions.{" "}
        <Link className="underline" href="/docs/packed">
          Read the compatibility guide.
        </Link>
      </div>
      <RequestState error={error} loading={loading} />
      <div className="packed-grid">
        <section className="card min-w-0">
          <div className="row between mb-4">
            <h2>1. Select scripts</h2>
            <span className="badge">
              {selection.length} selected ·{" "}
              {size(selection.reduce((sum, s) => sum + s.bytes, 0))} source
            </span>
          </div>
          <div className="searchbar mb-3">
            <Search size={16} />
            <input
              aria-label="Search packed scripts"
              placeholder="Search your scripts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="row mb-3">
            <select
              aria-label="Packed category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {[...new Set(scripts.map((s) => s.category))].sort().map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Packed collection"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              <option value="">All scripts</option>
              {collections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                changeSelection([
                  ...new Set([
                    ...selected,
                    ...shown
                      .filter((s) => s.compatibility.supported)
                      .map((s) => s.id),
                  ]),
                ])
              }
            >
              Select all shown
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => changeSelection([])}
            >
              Deselect all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                changeSelection([]);
                await reload();
              }}
            >
              Refresh scripts
            </Button>
          </div>
          {!loading && !error && !shown.length && (
            <p className="muted">
              No scripts found.{" "}
              <Link className="underline" href="/dashboard/editor">
                Create a script
              </Link>{" "}
              or install one from the registry.
            </p>
          )}
          <div className="packed-script-list">
            {shown.map((script) => (
              <article className="packed-script" key={script.id}>
                <label className="row !items-start">
                  <input
                    className="!w-auto mt-1"
                    type="checkbox"
                    disabled={!script.compatibility.supported || busy}
                    checked={selected.includes(script.id)}
                    onChange={(e) =>
                      changeSelection(
                        e.target.checked
                          ? [...selected, script.id]
                          : selected.filter((id) => id !== script.id),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <strong>{script.name}</strong>
                    <span className="muted block text-xs mt-1">
                      {script.description}
                    </span>
                  </span>
                </label>
                <div className="row mt-3">
                  <span className="badge">v{script.version}</span>
                  <span className="badge">{size(script.bytes)} source</span>
                  <span className="badge">
                    ≈ {size(estimatedScriptSize(script))} packed
                  </span>
                  <span
                    className={`badge ${script.compatibility.supported ? "green" : "red"}`}
                  >
                    {script.compatibility.supported
                      ? "Packageable"
                      : "Unsupported"}
                  </span>
                  <span className="badge">
                    {script.owned ? "Personal" : "Community"}
                  </span>
                </div>
                <p className="mono text-xs muted mt-3 break-all">
                  Websites:{" "}
                  {[
                    ...(script.metadata.match ?? []),
                    ...(script.metadata.include ?? []),
                  ].join(", ")}
                </p>
                <p className="mono text-xs muted mt-1">
                  Permissions:{" "}
                  {script.compatibility.grants.join(", ") || "none"}
                </p>
                {script.compatibility.blockers.map((b) => (
                  <p className="text-red-400 text-xs mt-2" key={b}>
                    {b}
                  </p>
                ))}
                <details className="mt-2 text-xs muted">
                  <summary>Compatibility and dependencies</summary>
                  {script.compatibility.warnings.map((warning) => (
                    <p className="mt-2" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {script.dependencies.map((url) => (
                    <p className="mono break-all mt-2" key={url}>
                      {url}
                    </p>
                  ))}
                </details>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setReview(script)}
                >
                  Review source
                </Button>
              </article>
            ))}
          </div>
        </section>
        <div className="form-stack min-w-0">
          <section className="card form-stack">
            <h2>2. Configure launcher</h2>
            <label>
              Bookmarklet name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Theme
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    theme: e.target.value as PackedSettings["theme"],
                  })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label>
              Default position
              <select
                value={settings.position}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    position: e.target.value as PackedSettings["position"],
                  })
                }
              >
                {["bottom-right", "bottom-left", "top-right", "top-left"].map(
                  (position) => (
                    <option key={position} value={position}>
                      {position.replace("-", " ")}
                    </option>
                  ),
                )}
              </select>
            </label>
            {(
              [
                ["compact", "Compact interface"],
                [
                  "initiallyEnabled",
                  "Scripts initially enabled (still run manually)",
                ],
                ["descriptions", "Display descriptions"],
                ["warnings", "Display compatibility warnings"],
                ["search", "Include search bar"],
                ["minify", "Minify launcher code (preserve userscript source)"],
                ["compression", "Experimental compressed bookmarklet"],
              ] as const
            ).map(([key, label]) => (
              <label className="row" key={key}>
                <input
                  className="!w-auto"
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: e.target.checked })
                  }
                />
                <span className="min-w-0 flex-1">{label}</span>
              </label>
            ))}
            {settings.compression && (
              <p className="alert text-xs">
                Compresses the entire launcher and original scripts losslessly
                with gzip. Requires native browser decompression and dynamic
                execution, which CSP or Trusted Types may block. Only used if
                the complete bookmarklet URL is smaller.
              </p>
            )}
          </section>
          <section className="card form-stack">
            <h2>3. Review and build</h2>
            <p className="muted text-sm">
              Estimated total bookmarklet:{" "}
              {estimatedTotal === null
                ? "Calculating…"
                : `≈ ${size(estimatedTotal)}`}{" "}
              including launcher, metadata, and URL encoding. External
              dependency sizes are additional and unknown until retrieved. Exact
              size is shown after generation. Up to 30 scripts per build.
              {settings.compression &&
                " This estimate is before experimental compression; the final result includes loader overhead."}
            </p>
            <p className="muted text-xs">
              Account credentials and saved GM settings are excluded. Each
              launcher keeps its own GM values in memory until closed or
              reloaded.
            </p>
            {selection.some((s) => !s.owned) && (
              <label className="row !items-start">
                <input
                  className="!w-auto mt-1"
                  type="checkbox"
                  checked={community}
                  onChange={(e) => setCommunity(e.target.checked)}
                />
                I reviewed and approve including these untrusted community
                scripts.
              </label>
            )}
            {selection.some((s) => s.dependencies.length) && (
              <>
                <div className="alert text-xs break-all">
                  {selection.flatMap((s) =>
                    s.dependencies.map((url) => (
                      <p key={s.id + url}>
                        {s.name}: {url}
                      </p>
                    )),
                  )}
                </div>
                <label className="row !items-start">
                  <input
                    className="!w-auto mt-1"
                    type="checkbox"
                    checked={dependencies}
                    onChange={(e) => setDependencies(e.target.checked)}
                  />
                  I approve retrieving and bundling the listed external
                  dependencies during generation.
                </label>
              </>
            )}
            {buildError && (
              <p className="alert error" role="alert">
                {buildError}
              </p>
            )}
            <Button
              disabled={
                busy ||
                !selection.length ||
                selection.length > 30 ||
                !approved ||
                !name.trim()
              }
              onClick={() => generate()}
            >
              {busy ? "Generating…" : "Generate bookmarklet"}
            </Button>
          </section>
        </div>
      </div>
      <section className="card mt-6" id="saved-builds">
        <h2>Saved build profiles</h2>
        <p className="muted text-sm mt-2">
          Saved in this browser for your account. Profiles contain selections,
          versions, and settings; no script source or credentials. Loading a
          profile requires fresh approval.
        </p>
        <div className="row mt-4">
          <input
            className="!max-w-xs"
            aria-label="Build profile name"
            placeholder="e.g. Development tools"
            value={profileName}
            maxLength={80}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={
              !profileKey ||
              !profileName.trim() ||
              !selection.length ||
              profiles.length >= 20
            }
            onClick={() => {
              saveProfiles([
                ...profiles,
                {
                  id: crypto.randomUUID(),
                  name: profileName.trim(),
                  selections: selection.map((s) => ({
                    id: s.id,
                    versionId: s.versionId,
                  })),
                  settings,
                },
              ]);
              setProfileName("");
            }}
          >
            Save profile
          </Button>
        </div>
        {profiles.map((profile) => (
          <div className="row between mt-4" key={profile.id}>
            <div>
              <strong>{profile.name}</strong>
              <p className="muted text-xs">
                {profile.selections.length} scripts
              </p>
            </div>
            <div className="row">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const found = profile.selections.filter((s) =>
                    scripts.some((c) => c.id === s.id),
                  );
                  changeSelection(found.map((s) => s.id));
                  setSettings({ ...packedDefaults, ...profile.settings });
                  setName(profile.name);
                  if (
                    found.length !== profile.selections.length ||
                    found.some(
                      (s) =>
                        scripts.find((c) => c.id === s.id)?.versionId !==
                        s.versionId,
                    )
                  )
                    toast.info(
                      "Some saved scripts are unavailable or have changed. Review the current selection before rebuilding.",
                    );
                }}
              >
                Load profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  saveProfiles(profiles.filter((p) => p.id !== profile.id))
                }
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </section>
      {output && (
        <section
          className="card mt-6 form-stack packed-output"
          aria-label="Packed output"
        >
          <div className="row between">
            <h2>4. {output.name}</h2>
            <span className="badge green">Offline snapshot</span>
            <span
              className={`badge ${output.characters <= 64000 ? "green" : ""}`}
            >
              {output.characters <= 64000
                ? "Within 64,000-character target"
                : "Above 64,000-character target"}
            </span>
          </div>
          {signature !== builtSignature && (
            <p className="alert">
              Selection or settings changed. Generate again to update this
              bookmarklet.
            </p>
          )}
          <div className="packed-stats">
            <div>
              <strong>{output.characters.toLocaleString()}</strong>
              <p className="muted text-xs">URL characters</p>
            </div>
            <div>
              <strong>{size(output.bytes)}</strong>
              <p className="muted text-xs">Encoded bookmarklet</p>
            </div>
            <div>
              <strong>{output.manifest.scripts.length}</strong>
              <p className="muted text-xs">Included scripts</p>
            </div>
            <div>
              <strong>{size(output.codeBytes)}</strong>
              <p className="muted text-xs">JavaScript source</p>
            </div>
          </div>
          <p className="muted text-xs">
            Generated {new Date(output.generatedAt).toLocaleString()} ·{" "}
            {output.compression}
          </p>
          <p className="muted text-sm">{output.compatibility}</p>
          {output.compressionApplied && (
            <p className="alert">
              Compressed from {size(output.sizes.direct)} to{" "}
              {size(output.bytes)} including the loader (
              {Math.round((1 - output.bytes / output.sizes.direct) * 100)}%
              smaller). Source preview and JavaScript download contain the
              decompressed program for inspection.
            </p>
          )}
          {output.warnings.map((w) => (
            <p className="alert" key={w}>
              {w}
            </p>
          ))}
          <div className="row">
            <a
              ref={anchor}
              draggable
              className="inline-flex rounded-lg bg-lime-400 px-5 py-3 font-semibold text-zinc-950"
              onClick={(e) => {
                e.preventDefault();
                toast.info(
                  "Drag this link to the bookmarks bar, or copy the bookmarklet URL.",
                );
              }}
            >
              Drag to bookmarks: {output.name}
            </a>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(output.bookmarklet);
                  toast.success("Bookmarklet copied");
                } catch {
                  toast.error(
                    "Clipboard unavailable. Copy from the bookmarklet URL below.",
                  );
                }
              }}
            >
              <Copy size={15} />
              Copy bookmarklet
            </Button>
            {output.compressionApplied && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      encodeBookmarklet(output.code),
                    );
                    toast.success("Standard bookmarklet copied");
                  } catch {
                    toast.error(
                      "Clipboard unavailable. Copy the standard URL below.",
                    );
                  }
                }}
              >
                Copy standard fallback
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([output.code], {
                    type: "text/javascript;charset=utf-8",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "raxlet-packed.js";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={15} />
              Download JavaScript
            </Button>
            <Button variant="outline" onClick={() => setPreview(!preview)}>
              Preview source
            </Button>
            <Button
              variant="outline"
              disabled={busy || !selection.length || !approved}
              onClick={async () => {
                setBusy(true);
                try {
                  const candidates = await api<PackedCandidate[]>(
                    "packed/scripts?latest=true",
                  );
                  const next = candidates.filter((s) =>
                    selected.includes(s.id),
                  );
                  if (next.length !== selection.length)
                    throw new Error(
                      "A selected script is unavailable. Reload and review your selection.",
                    );
                  setLatestSelection(next);
                  setCommunity(false);
                  setDependencies(false);
                  setBuildError("");
                  setConfirmLatest(true);
                } catch (error) {
                  setBuildError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Regenerate with latest versions
            </Button>
          </div>
          <details>
            <summary className="muted text-xs">Bookmarklet URL</summary>
            <textarea
              className="mono !min-h-32 mt-2"
              aria-label="Generated bookmarklet URL"
              readOnly
              value={output.bookmarklet}
            />
          </details>
          {output.compressionApplied && (
            <details>
              <summary className="muted text-xs">
                Standard bookmarklet fallback (larger, no decompression)
              </summary>
              <textarea
                className="mono !min-h-32 mt-2"
                aria-label="Standard bookmarklet URL"
                readOnly
                value={encodeBookmarklet(output.code)}
              />
            </details>
          )}
          {preview && (
            <>
              {output.compressionApplied && (
                <label className="row">
                  <input
                    className="!w-auto"
                    type="checkbox"
                    checked={previewLoader}
                    onChange={(e) => setPreviewLoader(e.target.checked)}
                  />
                  Inspect compressed loader instead of decompressed source
                </label>
              )}
              <Monaco
                height="400px"
                language="javascript"
                theme="vs-dark"
                value={previewLoader ? output.bookmarkletCode : output.code}
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  minimap: { enabled: false },
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Included script</th>
                  <th>Version</th>
                  <th>Contribution</th>
                  <th>SHA-256 source hash</th>
                </tr>
              </thead>
              <tbody>
                {[...output.manifest.scripts]
                  .sort((a, b) => b.bytes - a.bytes)
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.version}</td>
                      <td>{size(s.bytes)}</td>
                      <td className="mono text-xs break-all">{s.hash}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!!changes.length && (
            <div className="alert">
              <strong>Changed since the previous build</strong>
              {changes.map((change) => (
                <p key={change}>{change}</p>
              ))}
            </div>
          )}
          <details>
            <summary className="muted text-xs">
              Size comparison and optimization
            </summary>
            <p className="muted text-sm mt-3">
              Unminified, URL encoded: {size(output.sizes.unminified)}. Minified
              launcher, URL encoded: {size(output.sizes.minified)}.
              Gzip/base64url payload alone: {size(output.sizes.gzipBase64)}.
              Complete compressed URL including loader:{" "}
              {size(output.sizes.compressed)}. Standard URL for these settings:{" "}
              {size(output.sizes.direct)}.
            </p>
            <p className="muted text-xs mt-2">{output.sizes.compressionNote}</p>
            <p className="muted text-xs mt-2">
              Reduce size by selecting fewer scripts, using collections for
              separate bookmarklets, or choosing minification. Userscript source
              is preserved verbatim.
            </p>
          </details>
        </section>
      )}
      <ConfirmDialog
        open={!!review}
        onOpenChange={(open) => !open && setReview(null)}
        title={review ? `${review.name} · v${review.version}` : "Script source"}
      >
        <pre className="source-view">
          <code>{review?.source}</code>
        </pre>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmLatest}
        onOpenChange={setConfirmLatest}
        title="Regenerate with latest versions?"
      >
        <p className="muted mb-4">
          This build uses the latest published version of every selected script,
          including versions newer than your installed library entries. Library
          installations remain unchanged. Review these versions before using the
          replacement bookmark.
        </p>
        {latestSelection.map((s) => (
          <div className="mb-4" key={s.id}>
            <strong>
              {s.name} · v{s.version}
            </strong>
            <Button size="sm" variant="ghost" onClick={() => setReview(s)}>
              Review source
            </Button>
            {s.dependencies.map((url) => (
              <p className="mono text-xs break-all" key={url}>
                {url}
              </p>
            ))}
            {s.compatibility.blockers.map((b) => (
              <p className="text-red-400 text-xs" key={b}>
                {b}
              </p>
            ))}
          </div>
        ))}
        <label className="row mb-4">
          <input
            className="!w-auto"
            type="checkbox"
            checked={community}
            onChange={(e) => setCommunity(e.target.checked)}
          />
          I approve including any selected community scripts at their latest
          versions.
        </label>
        <label className="row mb-4">
          <input
            className="!w-auto"
            type="checkbox"
            checked={dependencies}
            onChange={(e) => setDependencies(e.target.checked)}
          />
          I approve fetching external dependencies declared by the latest
          versions.
        </label>
        <Button
          disabled={
            busy ||
            latestSelection.some((s) => !s.compatibility.supported) ||
            (latestSelection.some((s) => !s.owned) && !community) ||
            (latestSelection.some((s) => s.dependencies.length) &&
              !dependencies)
          }
          onClick={() => generate(true)}
        >
          Confirm regeneration
        </Button>
        {buildError && (
          <p role="alert" className="alert error mt-3">
            {buildError}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
