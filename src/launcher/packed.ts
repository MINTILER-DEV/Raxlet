import { matchesUrl } from "../lib/url-match";
import type { PackedManifest } from "../lib/packed-types";
import { executionContext } from "./context";
type Runner = (...args: unknown[]) => Promise<unknown>;
export function start(manifest: PackedManifest, runners: Runner[]) {
  if (location.origin === manifest.origin) {
    alert("Packed scripts cannot run on the Raxlet account origin.");
    return;
  }
  if (!["http:", "https:"].includes(location.protocol)) {
    alert("Raxlet Packed Mode requires a normal HTTP or HTTPS webpage.");
    return;
  }
  const prior = document.getElementById("raxlet-packed-launcher");
  if (prior) {
    prior.remove();
  }
  const config = manifest.settings;
  const host = document.createElement("div");
  host.id = "raxlet-packed-launcher";
  host.style.cssText =
    "all:initial;position:fixed;z-index:2147483647;width:min(380px,calc(100vw - 24px));font:14px system-ui;";
  host.style[config.position.endsWith("left") ? "left" : "right"] = "12px";
  host.style[config.position.startsWith("top") ? "top" : "bottom"] = "12px";
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = "",
    parent: Node = root,
  ) => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.appendChild(node);
    return node;
  };
  const style = el("style");
  // Prefix every fallback selector so launcher styles do not affect the page.
  const prefix = root === host ? "#raxlet-packed-launcher " : "";
  style.textContent = `
    ${prefix}.panel{--bg:#17191e;--fg:#f4f4f5;--muted:#b1b5c1;--line:#3e4350;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 50px #0006;font:14px/1.5 system-ui;overflow:hidden;text-align:left}
    ${prefix}.light{--bg:#fff;--fg:#20232b;--muted:#545b6a;--line:#c6cbd6}
    ${prefix}.panel *{box-sizing:border-box;font-family:inherit}
    ${prefix}.head{display:flex;align-items:center;gap:8px;padding:12px;cursor:move;touch-action:none;background:var(--bg)}
    ${prefix}.title{flex:1;font-weight:700;overflow-wrap:anywhere}
    ${prefix}button{font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);padding:5px 9px;cursor:pointer}
    ${prefix}button:disabled{opacity:.5;cursor:default}
    ${prefix}button:focus-visible,${prefix}input:focus-visible{outline:2px solid #84cc16;outline-offset:2px}
    ${prefix}.body{padding:0 12px 12px;max-height:65vh;overflow:auto}
    ${prefix}input{width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit}
    ${prefix}article{border-top:1px solid var(--line);padding:12px 0}
    ${prefix}h3{font-size:14px;margin:0 0 4px;font-weight:650;overflow-wrap:anywhere}
    ${prefix}p{margin:6px 0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
    ${prefix}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    ${prefix}.run{background:#b0eb5b;color:#172107;border-color:#b0eb5b}
    ${prefix}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 monospace;max-height:180px;overflow:auto;color:var(--fg)}
    ${prefix}.status{color:var(--fg);font-size:12px}
    ${prefix}.compact article{padding:7px 0}
    ${prefix}[hidden]{display:none!important}
  `;
  const panel = el("section");
  panel.className =
    "panel" +
    (config.compact ? " compact" : "") +
    (config.theme === "light" ||
    (config.theme === "system" &&
      matchMedia("(prefers-color-scheme:light)").matches)
      ? " light"
      : "");
  panel.setAttribute("aria-label", "Raxlet Packed launcher");
  const header = el("div", "", panel);
  header.className = "head";
  el("span", manifest.name, header).className = "title";
  const button = (text: string, parent: Node, action: () => void) => {
    const node = el("button", text, parent);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  const body = el("div", "", panel);
  body.className = "body";
  const minimize = button("−", header, () => {
    body.hidden = !body.hidden;
    minimize.setAttribute("aria-expanded", String(!body.hidden));
  });
  minimize.setAttribute("aria-label", "Minimize or expand launcher");
  minimize.setAttribute("aria-expanded", "true");
  const close = button("×", header, () => host.remove());
  close.setAttribute("aria-label", "Close launcher");
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") host.remove();
  });
  const footer = el(
    "p",
    "Offline snapshot · Manual execution · No account connection",
    body,
  );
  footer.className = "status";
  const search = config.search ? el("input", "", body) : null;
  if (search) {
    search.type = "search";
    search.placeholder = "Search packed scripts";
    search.setAttribute("aria-label", "Search packed scripts");
  }
  const list = el("div", "", body);
  const empty = el("p", "No scripts match your search.", body);
  empty.hidden = true;
  const entries = manifest.scripts.map((script, index) => {
    let enabled = script.enabled;
    let settings: Record<string, unknown> = {};
    let running = false;
    const row = el("article", "", list);
    el("h3", script.name, row);
    el(
      "p",
      `v${script.version} · ${matchesUrl(script.metadata, location.href) ? "Matches this page" : "Does not match this page"}`,
      row,
    );
    if (config.descriptions && script.description)
      el("p", script.description, row);
    if (config.warnings)
      script.warnings.forEach((warning) => el("p", warning, row));
    const actions = el("div", "", row);
    actions.className = "actions";
    const status = el("p", "Ready", row);
    status.className = "status";
    status.setAttribute("role", "status");
    const setStatus = (value: string) => {
      status.textContent = value;
    };
    const update = () => {
      toggle.textContent = enabled ? "Disable" : "Enable";
      toggle.setAttribute("aria-pressed", String(enabled));
      run.disabled =
        !enabled || running || !matchesUrl(script.metadata, location.href);
    };
    const toggle = button(enabled ? "Disable" : "Enable", actions, () => {
      enabled = !enabled;
      update();
    });
    toggle.setAttribute("aria-label", `Enable or disable ${script.name}`);
    const source = el("pre", runners[index].toString(), row);
    source.hidden = true;
    button("Source", actions, () => {
      source.hidden = !source.hidden;
    });
    const confirmation = el("div", "", row);
    confirmation.hidden = true;
    el(
      "p",
      `Run ${script.name}? This code can read and change this page and make its own network requests. ${script.warnings.join(" ")}`,
      confirmation,
    );
    button("Cancel", confirmation, () => {
      confirmation.hidden = true;
    });
    const confirm = button("Confirm & run", confirmation, () => {
      void perform();
    });
    const run = button("Run", actions, () => {
      confirmation.hidden = false;
      confirm.focus();
    });
    run.className = "run";
    async function perform() {
      confirmation.hidden = true;
      if (running) return;
      try {
        if (
          location.origin === manifest.origin ||
          !["http:", "https:"].includes(location.protocol)
        )
          throw new Error("Execution is blocked on this origin.");
        if (!enabled) throw new Error("Enable this script before running it.");
        if (!matchesUrl(script.metadata, location.href))
          throw new Error("This script does not match the current page URL.");
        running = true;
        update();
        setStatus("Running…");
        const context = executionContext(
          {
            id: script.id,
            name: script.name,
            source: runners[index].toString(),
            metadata: script.metadata,
            enabled,
            settings,
          },
          script.metadata,
          async (next) => {
            settings = next;
          },
          setStatus,
          script.resources,
          script.metaStr,
        );
        await runners[index](...context.values, context.gm);
        await context.flush();
        setStatus(
          "Completed · Later callbacks and network work may still be pending.",
        );
      } catch (error) {
        setStatus(
          `Execution failed: ${(error as Error).message}. Check this page's CSP and supported APIs.`,
        );
      } finally {
        running = false;
        update();
      }
    }
    update();
    return { row, script };
  });
  search?.addEventListener("input", () => {
    const q = search.value.toLowerCase();
    entries.forEach(({ row, script }) => {
      row.hidden = !(script.name + " " + script.description)
        .toLowerCase()
        .includes(q);
    });
    empty.hidden = entries.some(({ row }) => !row.hidden);
  });
  // Pointer dragging and keyboard movement share the same viewport bounds.
  header.tabIndex = 0;
  header.setAttribute("aria-label", "Move launcher: drag or use arrow keys");
  const move = (x: number, y: number) => {
    host.style.left = `${Math.max(0, Math.min(innerWidth - host.offsetWidth, x))}px`;
    host.style.top = `${Math.max(0, Math.min(innerHeight - Math.min(host.offsetHeight, innerHeight), y))}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  };
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  header.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = host.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener("pointermove", (e) => {
    if (drag)
      move(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y);
  });
  header.addEventListener("pointerup", () => {
    drag = null;
  });
  header.addEventListener("pointercancel", () => {
    drag = null;
  });
  header.addEventListener("keydown", (e) => {
    if (
      e.target !== header ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      return;
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    move(
      rect.left +
        (e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0),
      rect.top + (e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0),
    );
  });
  document.documentElement.append(host);
  header.focus();
}
