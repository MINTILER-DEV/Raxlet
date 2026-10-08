import { matchesUrl } from "../lib/userscript";
import type { LibraryEntry } from "../lib/types";
import { execute } from "./engine";
(() => {
  const scriptUrl = (document.currentScript as HTMLScriptElement | null)?.src;
  if (!scriptUrl) return;
  const raxletOrigin = new URL(scriptUrl).origin;
  if (location.origin === raxletOrigin) {
    alert(
      "Open a third-party webpage to use the Raxlet launcher. Scripts cannot run on the Raxlet account origin.",
    );
    return;
  }
  if (!["http:", "https:"].includes(location.protocol)) {
    alert("Raxlet cannot run on restricted browser pages.");
    return;
  }
  const existing = document.getElementById("raxlet-launcher");
  if (existing) {
    existing.style.display = "block";
    return;
  }
  const host = document.createElement("div");
  host.id = "raxlet-launcher";
  host.style.cssText =
    "all:initial;position:fixed;right:20px;top:80px;width:min(380px,calc(100vw - 32px));z-index:2147483647;";
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  const style = document.createElement("style");
  style.textContent = `*{box-sizing:border-box}section{font:13px Arial,sans-serif;color:#f4f4f5;background:#17191c;border:1px solid #3f4247;border-radius:12px;box-shadow:0 20px 70px #0009;overflow:hidden}header{padding:15px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #333;cursor:move;touch-action:none}header strong{flex:1;font-size:17px;color:#b5ed63}button{cursor:pointer;font:12px Arial;border:1px solid #444;background:#25272b;color:#eee;border-radius:6px;padding:7px 10px}button:disabled{opacity:.4;cursor:not-allowed}input{width:100%;background:#101113;color:white;border:1px solid #444;padding:10px;border-radius:6px;font:13px Arial}main{padding:15px;max-height:min(70vh,580px);overflow:auto}p{line-height:1.6;color:#a1a1aa;margin:8px 0}a{color:#b5ed63}article{padding:12px 0;border-bottom:1px solid #333}article h3{font-size:13px;margin:0 0 5px}article p{font-size:11px;margin:5px 0;word-break:break-word}.row{display:flex;gap:8px;align-items:center}.badge{font-size:10px;color:#b5ed63}small{font-size:10px;display:block;color:#a1a1aa;margin:7px 0}.status{padding:9px 12px;font-size:11px;border-top:1px solid #333;color:#b5ed63;overflow-wrap:anywhere}.primary{background:#b5ed63;color:#111;border-color:#b5ed63}label{font-size:11px;color:#ddd}.check{width:auto}details{margin:9px 0}pre{max-height:200px;overflow:auto;white-space:pre;font:10px monospace;color:#ddd;border:1px solid #444;padding:9px}.warning{color:#e9b949;font-size:11px}`;
  root.append(style);
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Raxlet launcher");
  root.append(panel);
  const header = document.createElement("header");
  const brand = document.createElement("strong");
  brand.textContent = ">_ raxlet";
  header.append(brand);
  const button = (label: string, handler: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = handler;
    return b;
  };
  const main = document.createElement("main");
  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  status.textContent = "Link your account to load your library.";
  let minimized = false;
  header.append(
    button("−", () => {
      minimized = !minimized;
      main.hidden = minimized;
      status.hidden = minimized;
    }),
    button("×", () => {
      port?.close();
      popup?.close();
      host.remove();
      cleanup();
    }),
  );
  panel.append(header, main, status);
  document.documentElement.append(host);
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  header.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = host.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener("pointermove", (e) => {
    if (!drag) return;
    host.style.right = "auto";
    host.style.left =
      Math.max(
        0,
        Math.min(innerWidth - host.offsetWidth, drag.left + e.clientX - drag.x),
      ) + "px";
    host.style.top =
      Math.max(0, Math.min(innerHeight - 50, drag.top + e.clientY - drag.y)) +
      "px";
  });
  header.addEventListener("pointerup", () => {
    drag = null;
  });
  let popup: Window | null = null;
  let port: MessagePort | null = null;
  let entries: LibraryEntry[] = [];
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let nonce = "";
  let query = "";
  function request<T>(
    operation: string,
    extra: Record<string, unknown> = {},
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!port) return reject(new Error("Account is not linked."));
      const requestId = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            "Raxlet did not respond. Keep the authorization window open or link again.",
          ),
        );
      }, 10000);
      pending.set(requestId, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      port.postMessage({ requestId, operation, ...extra });
    });
  }
  async function refresh() {
    status.textContent = "Loading library…";
    try {
      entries = await request<LibraryEntry[]>("library");
      renderLibrary();
      status.textContent = `${entries.length} scripts loaded · Account link lasts 15 minutes.`;
    } catch (e) {
      status.textContent = (e as Error).message;
      showLink();
    }
  }
  const receive = (e: MessageEvent) => {
    if (
      !popup ||
      e.source !== popup ||
      e.origin !== raxletOrigin ||
      e.data?.nonce !== nonce
    )
      return;
    if (e.data?.type === "raxlet-disconnected") {
      const error = new Error(
        "Account link closed, expired, or revoked. Link again.",
      );
      port?.close();
      port = null;
      entries = [];
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
      status.textContent = error.message;
      showLink();
      return;
    }
    if (e.data?.type !== "raxlet-ready") return;
    port?.close();
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (message) => {
      const item = pending.get(message.data?.requestId);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.data.requestId);
      if (message.data.error) item.reject(new Error(message.data.error));
      else item.resolve(message.data.data);
    };
    port.start();
    popup.postMessage({ type: "raxlet-connect", nonce }, raxletOrigin, [
      channel.port2,
    ]);
    void refresh();
  };
  window.addEventListener("message", receive);
  const cleanup = () => {
    window.removeEventListener("message", receive);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("Launcher closed."));
    }
    pending.clear();
  };
  function link() {
    popup?.close();
    nonce = crypto.randomUUID();
    popup = window.open(
      `${raxletOrigin}/authorize?origin=${encodeURIComponent(location.origin)}&nonce=${encodeURIComponent(nonce)}`,
      "_blank",
      "popup,width=560,height=700",
    );
    if (!popup) {
      status.textContent =
        "Popup blocked. Allow popups for this page and click Link account again.";
      return;
    }
    status.textContent =
      "Approve this website in the Raxlet window. Keep that window open.";
  }
  function showLink() {
    main.replaceChildren();
    const intro = document.createElement("p");
    intro.textContent =
      "Your library, on this page. Link your account through a Raxlet window; no account token is stored on this website.";
    const warn = document.createElement("p");
    warn.className = "warning";
    warn.textContent =
      "Only link pages you trust. This page and scripts you run can inspect shared script source and settings.";
    const linkButton = button("Link account", link);
    linkButton.className = "primary";
    const fallback = document.createElement("a");
    fallback.href = `${raxletOrigin}/dashboard/library`;
    fallback.target = "_blank";
    fallback.rel = "noopener noreferrer";
    fallback.textContent = "Open library on Raxlet ↗";
    main.append(intro, warn, linkButton, document.createElement("p"), fallback);
  }
  function renderLibrary() {
    main.replaceChildren();
    const search = document.createElement("input");
    search.placeholder = "Search your library…";
    search.setAttribute("aria-label", "Search script library");
    search.value = query;
    const list = document.createElement("div");
    search.oninput = () => {
      query = search.value;
      renderList(list);
    };
    main.append(search, list);
    const tools = document.createElement("div");
    tools.className = "row";
    tools.append(
      button("Refresh library", () => void refresh()),
      button("Link again", link),
    );
    main.append(tools);
    renderList(list);
  }
  function renderList(list: HTMLElement) {
    list.replaceChildren();
    const filtered = entries.filter((e) =>
      e.name.toLowerCase().includes(query.toLowerCase()),
    );
    if (!filtered.length) {
      const p = document.createElement("p");
      p.textContent =
        "No scripts found. Install or create scripts on Raxlet, then refresh.";
      list.append(p);
    }
    for (const entry of filtered) {
      const card = document.createElement("article");
      const h = document.createElement("h3");
      h.textContent = entry.name;
      const p = document.createElement("p");
      p.textContent = entry.description;
      const compatible = entry.compatibility.supported;
      const matching = matchesUrl(entry.metadata, location.href);
      const badge = document.createElement("small");
      badge.textContent = `v${entry.version} · ${compatible ? "Supported subset" : "Unsupported APIs"} · ${matching ? "Matches page" : "Does not match page"}`;
      const row = document.createElement("div");
      row.className = "row";
      const enable = button(entry.enabled ? "Disable" : "Enable", async () => {
        try {
          await request("toggle", {
            entryId: entry.id,
            enabled: !entry.enabled,
          });
          entry.enabled = !entry.enabled;
          renderList(list);
        } catch (e) {
          status.textContent = (e as Error).message;
        }
      });
      enable.disabled = !compatible;
      const run = button("Run", () => {
        const confirmBox = document.createElement("div");
        const warning = document.createElement("p");
        warning.className = "warning";
        warning.textContent =
          "This code can read and change this page. Requested permissions: " +
          (entry.compatibility.grants.join(", ") || "none") +
          ". Run only if you trust it.";
        const source = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Review installed source";
        const pre = document.createElement("pre");
        pre.textContent = entry.source;
        source.append(summary, pre);
        const confirmRun = button("Confirm & run", async () => {
          confirmRun.disabled = true;
          try {
            const fresh = await request<LibraryEntry>("prepare", {
              entryId: entry.id,
              versionId: entry.versionId,
              href: location.href,
            });
            Object.assign(entry, fresh);
            await execute(
              entry,
              raxletOrigin,
              async (settings) => {
                await request("storage", { entryId: entry.id, settings });
                entry.settings = settings;
              },
              (v) => {
                status.textContent = v;
              },
            );
          } catch (e) {
            status.textContent = `Execution failed: ${(e as Error).message}`;
          } finally {
            confirmBox.remove();
          }
        });
        confirmRun.className = "primary";
        confirmBox.append(
          warning,
          source,
          confirmRun,
          button("Cancel", () => confirmBox.remove()),
        );
        card.append(confirmBox);
      });
      run.disabled = !entry.enabled || !compatible || !matching;
      run.className = "primary";
      row.append(enable, run);
      card.append(h, p, badge, row);
      if (!compatible) {
        const w = document.createElement("p");
        w.className = "warning";
        w.textContent = entry.compatibility.blockers.join(" ");
        card.append(w);
      }
      list.append(card);
    }
  }
  showLink();
})();
