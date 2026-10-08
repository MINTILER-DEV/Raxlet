"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Rocket, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { bookmarklet, launcherSnippet } from "@/lib/bookmarklet";
import { api, mutation } from "@/lib/client";
import { Button } from "./ui/button";
import { useRemote, RequestState } from "./workspace";
import { LauncherTabs } from "./launcher-tabs";
export function LauncherPage() {
  const [origin, setOrigin] = useState("");
  const anchor = useRef<HTMLAnchorElement>(null);
  const { data, error, loading, reload } = useRemote<
    { id: string; origin: string; expiresAt: string }[]
  >("launcher/authorizations");
  useEffect(() => {
    setOrigin(location.origin);
    if (anchor.current)
      anchor.current.setAttribute("href", bookmarklet(location.origin));
  }, []);
  const snippet = origin ? launcherSnippet(origin) : "";
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Clipboard unavailable. Select and copy the code below.");
    }
  };
  return (
    <>
      <LauncherTabs />
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR LIBRARY, ON THE PAGE</div>
          <h1>The Raxlet launcher</h1>
          <p>One reusable shortcut. Your latest library, every time.</p>
        </div>
        <Rocket size={32} className="text-lime-400" />
      </div>
      <div className="alert mb-6">
        <ShieldCheck size={16} className="inline mr-2" />
        Some websites block injected scripts, popups, or dynamic execution. The
        launcher cannot bypass browser security.{" "}
        <Link className="underline" href="/docs/launcher">
          Read the guide.
        </Link>
      </div>
      <div className="grid-cards !grid-cols-1 lg:!grid-cols-2">
        <div className="card">
          <span className="badge green">01 · BOOKMARKLET</span>
          <h2 className="mt-4">Drag. Bookmark. Launch.</h2>
          <p className="muted my-4">
            Drag this button to your bookmarks bar. Open another webpage and
            click the saved bookmark.
          </p>
          <a
            ref={anchor}
            draggable
            className="inline-flex rounded-lg bg-lime-400 px-5 py-3 font-semibold text-zinc-950"
            onClick={(e) => {
              e.preventDefault();
              toast.info(
                "Drag this link to your bookmarks bar, or copy the bookmark URL.",
              );
            }}
          >
            ➜ Launch Raxlet
          </a>
          <Button
            variant="ghost"
            className="ml-2"
            onClick={() => copy(bookmarklet(origin))}
          >
            <Copy size={14} />
            Copy bookmark URL
          </Button>
          <details className="mt-4">
            <summary className="muted text-xs">Bookmark URL</summary>
            <pre className="!whitespace-pre-wrap !break-all">
              {origin ? bookmarklet(origin) : "Loading…"}
            </pre>
          </details>
        </div>
        <div className="card">
          <span className="badge">02 · DEVTOOLS CONSOLE</span>
          <h2 className="mt-4">Paste when you need it.</h2>
          <p className="muted my-4">
            Open browser DevTools on your target webpage, review the snippet,
            and paste it in the Console.
          </p>
          <pre className="!whitespace-pre-wrap !break-all">
            {snippet || "Loading…"}
          </pre>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => copy(snippet)}
          >
            <Copy size={14} />
            Copy console snippet
          </Button>
        </div>
      </div>
      <div className="launcher-demo mt-6">
        <h3>A deliberate account link</h3>
        <p className="muted mt-3 max-w-3xl">
          Click “Link account” in the floating launcher. Raxlet opens an
          approval window showing the target origin. Approving shares your
          library with that page for 15 minutes. Keep the window open. Account
          credentials stay on Raxlet; the target page receives script source and
          settings through a scoped bridge.
        </p>
        <p className="muted text-xs mt-3">
          Link only trusted websites. Scripts run manually, after confirmation.
          No automatic execution is provided.
        </p>
      </div>
      <div className="section-heading">
        <h2>Website authorizations</h2>
      </div>
      <RequestState error={error} loading={loading} />
      {data?.length ? (
        <div className="library-list">
          {data.map((a) => (
            <div className="library-row" key={a.id}>
              <div className="info">
                <h3 className="mono !text-sm">{a.origin}</h3>
                <p>
                  {new Date(a.expiresAt) > new Date() ? "Expires" : "Expired"}{" "}
                  {new Date(a.expiresAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await api(
                      `launcher/authorizations/${a.id}`,
                      mutation("DELETE"),
                    );
                    await reload();
                    toast.success("Authorization revoked");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : (
        !loading && !error && <p className="muted">No websites linked yet.</p>
      )}
    </>
  );
}
