"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, mutation, authClient } from "@/lib/client";
import { Button } from "./ui/button";
export function Authorize() {
  const params = useSearchParams();
  const target = params.get("origin") ?? "";
  const nonce = params.get("nonce") ?? "";
  const { data: session, isPending } = authClient.useSession();
  const [authorization, setAuthorization] = useState<{
    id: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const port = useRef<MessagePort | null>(null);
  const valid = (() => {
    try {
      return (
        ["http:", "https:"].includes(new URL(target).protocol) &&
        new URL(target).origin === target &&
        nonce.length >= 32 &&
        nonce.length <= 64
      );
    } catch {
      return false;
    }
  })();
  useEffect(() => {
    if (!authorization || !valid) return;
    let active = true;
    let inFlight = 0;
    const opener = window.opener as Window | null;
    if (!opener) {
      setError(
        "The browser severed the popup connection. Return to your Raxlet library and review the launcher guide.",
      );
      return;
    }
    const ready = () => {
      if (Date.now() > new Date(authorization.expiresAt).getTime()) {
        port.current?.close();
        setError("Authorization expired. Close this window and link again.");
        return;
      }
      opener.postMessage({ type: "raxlet-ready", nonce }, target);
    };
    const connect = (event: MessageEvent) => {
      if (
        event.source !== opener ||
        event.origin !== target ||
        event.data?.type !== "raxlet-connect" ||
        event.data?.nonce !== nonce ||
        !event.ports[0] ||
        port.current
      )
        return;
      port.current = event.ports[0];
      setConnected(true);
      port.current.onmessage = async (message) => {
        const data = message.data;
        if (
          !data ||
          !Number.isSafeInteger(data.requestId) ||
          !["library", "prepare", "toggle", "storage"].includes(data.operation)
        )
          return;
        const p = port.current;
        if (inFlight >= 8) {
          p?.postMessage({
            requestId: data.requestId,
            error: "Too many concurrent requests.",
          });
          return;
        }
        inFlight++;
        try {
          const result = await api(
            "launcher/bridge",
            mutation("POST", {
              authorizationId: authorization.id,
              origin: target,
              operation: data.operation,
              ...(typeof data.href === "string" ? { href: data.href } : {}),
              ...(typeof data.versionId === "string"
                ? { versionId: data.versionId }
                : {}),
              ...(typeof data.entryId === "string"
                ? { entryId: data.entryId }
                : {}),
              ...(typeof data.enabled === "boolean"
                ? { enabled: data.enabled }
                : {}),
              ...(data.settings !== undefined
                ? { settings: data.settings }
                : {}),
            }),
          );
          if (active)
            p?.postMessage({ requestId: data.requestId, data: result });
        } catch (e) {
          if (active)
            p?.postMessage({
              requestId: data.requestId,
              error: (e as Error).message,
            });
        } finally {
          inFlight--;
        }
      };
      port.current.start();
    };
    window.addEventListener("message", connect);
    ready();
    const interval = setInterval(() => {
      if (!port.current) ready();
    }, 750);
    const expiry = setTimeout(
      () => {
        port.current?.close();
        setConnected(false);
        setError("Authorization expired. Link again from the target page.");
      },
      Math.max(0, new Date(authorization.expiresAt).getTime() - Date.now()),
    );
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(expiry);
      window.removeEventListener("message", connect);
      port.current?.close();
      port.current = null;
    };
  }, [authorization, nonce, target, valid]);
  return (
    <div className="card">
      <div className="eyebrow">RAXLET · WEBSITE AUTHORIZATION</div>
      <h1>Link your library?</h1>
      {!valid ? (
        <p className="alert error mt-4">
          Invalid launcher request. Start from the Raxlet bookmarklet on a
          third-party page.
        </p>
      ) : (
        <>
          <p className="muted my-4">
            The following website wants access to your userscript library:
          </p>
          <p className="mono break-all text-lime-400 mb-5">{target}</p>
          <p className="alert mb-5">
            This page can read your script source and settings, toggle library
            entries, and save script settings for 15 minutes. It cannot publish
            scripts, delete your account, or access account credentials. Approve
            only a website you trust.
          </p>
          {error && (
            <p role="alert" className="alert error mb-5">
              {error}
            </p>
          )}
          {isPending ? (
            <p>Checking your session…</p>
          ) : !session ? (
            <Button asChild>
              <Link
                href={`/login?next=${encodeURIComponent(`/authorize?origin=${encodeURIComponent(target)}&nonce=${nonce}`)}`}
              >
                Sign in to approve
              </Link>
            </Button>
          ) : authorization ? (
            <>
              <p className="text-lime-400">
                {connected
                  ? "Connected. Return to the webpage and keep this window open."
                  : "Approved. Waiting for the target page to connect…"}
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={async () => {
                  try {
                    await api(
                      `launcher/authorizations/${authorization.id}`,
                      mutation("DELETE"),
                    );
                    port.current?.close();
                    setConnected(false);
                    setAuthorization(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Revoke access
              </Button>
            </>
          ) : (
            <div className="row">
              <Button
                disabled={busy}
                onClick={async () => {
                  if (!window.opener) {
                    setError(
                      "Popup connection unavailable. Use your library on the Raxlet website.",
                    );
                    return;
                  }
                  setBusy(true);
                  try {
                    setAuthorization(
                      await api(
                        "launcher/authorizations",
                        mutation("POST", { origin: target, confirmed: true }),
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Approving…" : "Approve for 15 minutes"}
              </Button>
              <Button variant="outline" onClick={() => window.close()}>
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
