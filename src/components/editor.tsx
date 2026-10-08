"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Save, Upload, Download, Code2 } from "lucide-react";
import { api, mutation } from "@/lib/client";
import { analyzeCompatibility, template } from "@/lib/userscript";
import { validateSource } from "@/lib/source";
import type { ScriptDetail } from "@/lib/types";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 520 }} />,
});
loader.config({ paths: { vs: "/monaco/vs" } });
export function ScriptEditor({ publish = false }: { publish?: boolean }) {
  const params = useSearchParams();
  const scriptId = params.get("id");
  const [source, setSource] = useState(template);
  const [saved, setSaved] = useState(template);
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [visibility, setVisibility] = useState<
    "private" | "unlisted" | "public"
  >(publish ? "public" : "private");
  const [category, setCategory] = useState("Utilities");
  const [tags, setTags] = useState("");
  const [screenshots, setScreenshots] = useState("");
  const [changelog, setChangelog] = useState("");
  const [savedDetails, setSavedDetails] = useState(
    JSON.stringify({
      visibility: publish ? "public" : "private",
      category: "Utilities",
      tags: "",
      screenshots: "",
      changelog: "",
    }),
  );
  const detailsSnapshot = JSON.stringify({
    visibility,
    category,
    tags,
    screenshots,
    changelog,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!scriptId);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"save" | "import" | null>(null);
  const [url, setUrl] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const analysis = useMemo(() => {
    try {
      const metadata = validateSource(source);
      return {
        metadata,
        compatibility: analyzeCompatibility(metadata, source),
        error: "",
      };
    } catch (e) {
      return {
        metadata: null,
        compatibility: null,
        error: (e as Error).message,
      };
    }
  }, [source]);
  const sourceDirty = source !== saved;
  const dirty = sourceDirty || detailsSnapshot !== savedDetails;
  useEffect(() => {
    if (!scriptId) return;
    api<ScriptDetail>(`scripts/${scriptId}`)
      .then((s) => {
        setScript(s);
        setSource(s.current.source);
        setSaved(s.current.source);
        setVisibility(s.visibility);
        setCategory(s.category);
        setTags(s.tags.join(", "));
        setScreenshots(s.screenshots.join("\n"));
        setSavedDetails(
          JSON.stringify({
            visibility: s.visibility,
            category: s.category,
            tags: s.tags.join(", "),
            screenshots: s.screenshots.join("\n"),
            changelog: "",
          }),
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scriptId]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a?.href &&
        new URL(a.href).href !== location.href &&
        !window.confirm("Discard unsaved script changes?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const details = {
        visibility,
        category,
        tags: tags
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        screenshots: screenshots
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
      };
      let s = script;
      if (s) {
        if (sourceDirty) {
          await api(
            `scripts/${s.id}/versions`,
            mutation("POST", {
              source,
              expectedRevision: s.revision,
              changelog,
              ...details,
            }),
          );
          s = await api<ScriptDetail>(`scripts/${s.id}`);
        } else
          await api(
            `scripts/${s.id}`,
            mutation("PATCH", { ...details, expectedRevision: s.revision }),
          );
        s = await api<ScriptDetail>(`scripts/${s.id}`);
      } else {
        const created = await api<{ id: string }>(
          "scripts",
          mutation("POST", {
            source,
            visibility,
            category,
            tags: tags
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            screenshots: screenshots
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            changelog,
          }),
        );
        s = await api<ScriptDetail>(`scripts/${created.id}`);
        history.replaceState(null, "", `/dashboard/editor?id=${s.id}`);
      }
      setScript(s);
      setSaved(source);
      setChangelog("");
      setSavedDetails(
        JSON.stringify({
          visibility,
          category,
          tags,
          screenshots,
          changelog: "",
        }),
      );
      toast.success(
        visibility === "public" ? "Script published" : "Script saved",
      );
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remoteImport() {
    setBusy(true);
    try {
      const imported = await api<{ source: string }>(
        "import",
        mutation("POST", { url, confirmed: true }),
      );
      setSource(imported.source);
      setConfirm(null);
      toast.success("Imported for review. Save when ready.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <div className="skeleton" />;
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">SCRIPT WORKSHOP</div>
          <h1>{script ? "Edit your script" : "Create something useful."}</h1>
          <p>
            {script
              ? `Revision ${script.revision} · Increase @version to save changed source.`
              : "Write, import, and review JavaScript in your own workspace."}
          </p>
        </div>
        <Button
          disabled={busy || !!analysis.error || (!!error && loading)}
          onClick={() =>
            visibility !== "private" ? setConfirm("save") : save()
          }
        >
          <Save size={16} />
          {busy
            ? "Saving…"
            : visibility === "public"
              ? "Save & publish"
              : "Save script"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <div className="editor-layout">
        <div>
          <div className="editor-pane">
            <div className="editor-toolbar">
              <span className="row mono text-xs">
                <Code2 size={15} />
                script.user.js
                {dirty && <span className="badge green">unsaved</span>}
              </span>
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => file.current?.click()}
                >
                  <Upload size={14} />
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const blob = new Blob([source], {
                      type: "text/javascript",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download =
                      (analysis.metadata?.name?.[0]?.replace(
                        /[^a-z0-9]/gi,
                        "-",
                      ) || "script") + ".user.js";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={14} />
                  Export
                </Button>
              </div>
            </div>
            <Monaco
              height="560px"
              language="javascript"
              theme="vs-dark"
              value={source}
              onChange={(v) => setSource(v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                padding: { top: 18 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: "on",
              }}
              onMount={(_editor, monaco) => {
                monaco.languages.setMonarchTokensProvider("javascript", {
                  tokenizer: {
                    root: [
                      [/^\s*\/\/\s*@\w+.*$/, "keyword"],
                      [/\/\/.*$/, "comment"],
                      [
                        /"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/,
                        "string",
                      ],
                      [
                        /\b(function|const|let|var|return|if|else|await|async|new|throw|for|of|true|false|null)\b/,
                        "keyword",
                      ],
                      [/\b\d+\b/, "number"],
                    ],
                  },
                });
              }}
            />
          </div>
          <input
            ref={file}
            type="file"
            accept=".js,.user.js,text/javascript"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 500000)
                  return toast.error("Maximum source size is 500KB.");
                if (
                  dirty &&
                  !window.confirm("Replace unsaved source with this file?")
                )
                  return;
                setSource(await f.text());
              }
              e.target.value = "";
            }}
          />
          <div className="card mt-4">
            <h3>Import from a URL</h3>
            <p className="muted text-xs my-2">
              Fetched only after your confirmation. Review imported source
              before saving.
            </p>
            <div className="row">
              <input
                type="url"
                aria-label="Userscript URL"
                placeholder="https://example.com/script.user.js"
                className="flex-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!url || busy}
                onClick={() => setConfirm("import")}
              >
                Import URL
              </Button>
            </div>
          </div>
        </div>
        <aside className="meta-panel">
          <div className="card form-stack">
            <h3>Script information</h3>
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as typeof visibility)
                }
              >
                <option value="private">Private · only you</option>
                <option value="unlisted">Unlisted · accessible by link</option>
                <option value="public">Public · discoverable</option>
              </select>
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "Utilities",
                  "Productivity",
                  "Accessibility",
                  "Appearance",
                  "Developer tools",
                  "Privacy",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Tags, separated by commas
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                maxLength={360}
              />
            </label>
            <label>
              Screenshot URLs, one per line
              <textarea
                value={screenshots}
                onChange={(e) => setScreenshots(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label>
              Changelog
              <textarea
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                maxLength={4000}
              />
            </label>
          </div>
          <div className="card">
            <h3>Metadata & permissions</h3>
            {analysis.error ? (
              <p className="alert error mt-3">{analysis.error}</p>
            ) : (
              <>
                <p className="mono text-xs muted my-3">
                  {analysis.metadata?.name?.[0]} · v
                  {analysis.metadata?.version?.[0]}
                </p>
                <label>
                  URL matches, one per line
                  <textarea
                    className="mono !text-xs"
                    value={analysis.metadata?.match?.join("\n") ?? ""}
                    onChange={(e) => {
                      const lines = e.target.value
                        .split("\n")
                        .filter(Boolean)
                        .map((p) => "// @match        " + p)
                        .join("\n");
                      const cleaned = source.replace(
                        /^\s*\/\/\s*@match\s+.*\r?\n/gm,
                        "",
                      );
                      setSource(
                        cleaned.replace(
                          "// ==/UserScript==",
                          lines + "\n// ==/UserScript==",
                        ),
                      );
                    }}
                  />
                </label>
                <div className="row my-3">
                  {(analysis.compatibility?.grants.length
                    ? analysis.compatibility.grants
                    : ["none"]
                  ).map((g) => (
                    <span className="badge" key={g}>
                      {g}
                    </span>
                  ))}
                </div>
                <span
                  className={`badge ${analysis.compatibility?.supported ? "green" : "red"}`}
                >
                  {analysis.compatibility?.supported
                    ? "Supported subset"
                    : "Needs attention"}
                </span>
                {analysis.compatibility?.blockers.map((w) => (
                  <p key={w} className="text-xs text-red-400 mt-2">
                    {w}
                  </p>
                ))}
                {analysis.compatibility?.warnings.map((w) => (
                  <p key={w} className="text-xs muted mt-2">
                    {w}
                  </p>
                ))}
                <details className="mt-4">
                  <summary className="muted text-xs cursor-pointer">
                    All directives
                  </summary>
                  <pre className="!p-2 !text-[10px]">
                    {JSON.stringify(analysis.metadata, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </div>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          confirm === "import"
            ? "Fetch this userscript?"
            : "Publish this version?"
        }
      >
        {confirm === "import" ? (
          <>
            <p className="muted mb-4 break-all">
              Raxlet will fetch {url}. Imported JavaScript remains untrusted and
              will not run here.
            </p>
            <Button disabled={busy} onClick={remoteImport}>
              {busy ? "Fetching…" : "Confirm import"}
            </Button>
          </>
        ) : (
          <>
            <p className="muted mb-4">
              The source will be readable by{" "}
              {visibility === "public"
                ? "everyone in the public registry"
                : "anyone with its link"}
              . Check that it contains no credentials or private information.
            </p>
            <p className="mono mb-4 text-xs">
              Permissions: {analysis.compatibility?.grants.join(", ") || "none"}
            </p>
            <Button disabled={busy} onClick={save}>
              {busy ? "Publishing…" : "Confirm & save"}
            </Button>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
