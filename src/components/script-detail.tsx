"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Flag, Star, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, mutation, authClient } from "@/lib/client";
import type { ScriptDetail, Version } from "@/lib/types";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
export function ScriptPage({ slug }: { slug: string }) {
  const [s, setS] = useState<ScriptDetail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"install" | "report" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [oldSource, setOldSource] = useState("");
  const { data: session } = authClient.useSession();
  useEffect(() => {
    Promise.all([
      api<ScriptDetail>(`scripts/${slug}`),
      api<Version[]>(`scripts/${slug}/versions`),
    ])
      .then(([a, b]) => {
        setS(a);
        setVersions(b);
      })
      .catch((e) => setError(e.message));
  }, [slug]);
  if (error)
    return (
      <div className="alert error" role="alert">
        {error}
      </div>
    );
  if (!s) return <div className="skeleton" />;
  async function submit() {
    if (!s) return;
    setBusy(true);
    try {
      if (dialog === "install") {
        const installed = await api<{ enabled: boolean; versionId: string }>(
          "library/install",
          mutation("POST", {
            scriptId: s.id,
            versionId: s.current.id,
            confirmed: true,
          }),
        );
        toast.success(
          installed.enabled
            ? "Already installed and enabled. Your installed version is unchanged."
            : "Installed, disabled. Enable it from your library when ready.",
        );
      } else {
        await api("reports", mutation("POST", { scriptId: s.id, reason }));
        toast.success("Report submitted for moderation.");
      }
      setDialog(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="muted text-xs" href="/explore">
        ← Back to explore
      </Link>
      <div className="section-heading">
        <div>
          <div className="row mb-4">
            <span className="badge">{s.category}</span>
            <span className="badge">v{s.current.version}</span>
            <span
              className={`badge ${s.current.compatibility.supported ? "green" : "red"}`}
            >
              {s.current.compatibility.supported
                ? "Supported subset"
                : "Limited compatibility"}
            </span>
            {s.visibility !== "public" && (
              <span className="badge">{s.visibility}</span>
            )}
          </div>
          <h1>{s.name}</h1>
          <p>
            by{" "}
            {s.author.username ? (
              <Link
                className="text-lime-400"
                href={`/users/${s.author.username}`}
              >
                {s.author.name}
              </Link>
            ) : (
              s.author.name
            )}{" "}
            · {s.installs} installations {s.rating ? `· ★ ${s.rating}` : ""}
          </p>
        </div>
        <div className="row">
          {session?.user.id === s.ownerId && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/editor?id=${s.id}`}>Edit script</Link>
            </Button>
          )}
          <Button
            onClick={() => {
              setReviewed(false);
              setDialog("install");
            }}
          >
            <Download size={16} />
            Install to library
          </Button>
        </div>
      </div>
      <div className="alert">
        <ShieldCheck className="inline mr-2" size={15} />
        Userscripts can read and change the page where you run them. Review
        source and permissions. Installation does not execute code.
      </div>
      <div className="detail-grid">
        <div>
          <div className="tabs">
            {["overview", "source", "versions"].map((v) => (
              <button
                key={v}
                onClick={() => {
                  setTab(v);
                  setOldSource("");
                }}
                className={tab === v ? "selected" : ""}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <>
              <h2>About this script</h2>
              <p className="muted whitespace-pre-wrap my-4">
                {s.description || "The author has not provided a description."}
              </p>
              <div className="row">
                {s.tags.map((v) => (
                  <Link
                    key={v}
                    href={`/explore?tag=${encodeURIComponent(v)}`}
                    className="badge"
                  >
                    #{v}
                  </Link>
                ))}
              </div>
              {!!s.screenshots.length && (
                <div className="screenshots">
                  {s.screenshots.map((url, i) => (
                    <a href={url} target="_blank" rel="noreferrer" key={url}>
                      <img
                        src={url}
                        alt={`${s.name} screenshot ${i + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : tab === "source" ? (
            <>
              <h2>Source code</h2>
              <p className="muted my-3 text-xs">
                Source is displayed as text and never executed on Raxlet.
              </p>
              <pre className="source-view">
                <code>{oldSource || s.current.source}</code>
              </pre>
            </>
          ) : (
            <>
              <h2>Version history</h2>
              <div className="library-list">
                {versions.map((v) => (
                  <div key={v.id} className="card">
                    <div className="row between">
                      <h3>v{v.version}</h3>
                      <span className="muted text-xs">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="muted whitespace-pre-wrap mt-3">
                      {v.changelog || "No changelog provided."}
                    </p>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const data = await api<Version>(
                            `scripts/${s.id}/source?version=${v.id}`,
                          );
                          setOldSource(data.source);
                          setTab("source");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      View this source
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="meta-panel">
          <div className="card">
            <h3>Supported pages</h3>
            {[
              ...(s.current.metadata.match ?? []),
              ...(s.current.metadata.include ?? []),
            ].map((v) => (
              <p className="mono text-xs muted break-all mt-3" key={v}>
                {v}
              </p>
            ))}
          </div>
          <div className="card">
            <h3>Requested permissions</h3>
            <div className="row mt-3">
              {(s.current.compatibility.grants.length
                ? s.current.compatibility.grants
                : ["none"]
              ).map((v) => (
                <span className="badge" key={v}>
                  {v}
                </span>
              ))}
            </div>
            {s.current.compatibility.blockers.map((v) => (
              <p className="text-xs text-red-400 mt-3" key={v}>
                {v}
              </p>
            ))}
            <Link href="/docs/compatibility" className="row muted text-xs mt-4">
              Compatibility guide
              <ExternalLink size={12} />
            </Link>
          </div>
          <div className="card">
            <h3>Rate this script</h3>
            <p className="text-xs muted mt-2">
              Installed users only. One rating per account.
            </p>
            <div className="row mt-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  aria-label={`Rate ${n} stars`}
                  onClick={async () => {
                    try {
                      await api(
                        `scripts/${s.id}/ratings`,
                        mutation("POST", { score: n }),
                      );
                      toast.success("Rating saved");
                      setS(await api(`scripts/${s.id}`));
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Star size={20} />
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-4"
              size="sm"
              onClick={() => setDialog("report")}
            >
              <Flag size={14} />
              Report script
            </Button>
          </div>
        </aside>
      </div>
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        title={
          dialog === "install"
            ? "Review before installing"
            : "Report this script"
        }
      >
        {!session ? (
          <>
            <p className="muted mb-4">Sign in to continue.</p>
            <Button asChild>
              <Link
                href={`/login?next=${encodeURIComponent(`/scripts/${slug}`)}`}
              >
                Sign in
              </Link>
            </Button>
          </>
        ) : dialog === "install" ? (
          <>
            <p className="alert mb-4">
              Running this code gives it access to the target page, including
              information you can see there. Raxlet does not sandbox community
              scripts.
            </p>
            <p className="mono mb-3 text-xs">
              Permissions: {s.current.compatibility.grants.join(", ") || "none"}
            </p>
            <pre className="source-view !max-h-64">
              <code>{s.current.source}</code>
            </pre>
            <label className="row my-4">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed the source and understand page access.
            </label>
            <Button disabled={!reviewed || busy} onClick={submit}>
              {busy ? "Installing…" : "Install, disabled"}
            </Button>
          </>
        ) : (
          <>
            <label>
              What is wrong?
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={10}
                maxLength={2000}
                placeholder="Describe malicious or inappropriate behavior…"
              />
            </label>
            <Button
              className="mt-4"
              disabled={reason.trim().length < 10 || busy}
              onClick={submit}
            >
              {busy ? "Submitting…" : "Submit report"}
            </Button>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
