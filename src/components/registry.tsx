"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Search,
  Code2,
  Download,
  ArrowUpRight,
  ArrowRight,
  Library,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
export type RegistryScript = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  username: string | null;
  installs: number;
  rating: number | null;
  updatedAt: string;
};
export function ScriptCard({ script: s }: { script: RegistryScript }) {
  return (
    <Link href={`/scripts/${s.slug}`} className="card script-card">
      <div className="row between">
        <span className="badge">{s.category}</span>
        <ArrowUpRight size={16} className="muted" />
      </div>
      <h3>{s.name}</h3>
      <p>{s.description || "No description provided."}</p>
      <div className="row mt-4">
        {s.tags.slice(0, 3).map((tag) => (
          <span className="badge" key={tag}>
            #{tag}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <span>by {s.username || s.author}</span>
        <span className="row">
          <Download size={12} />
          {s.installs}
          {s.rating ? ` · ★ ${s.rating}` : ""}
        </span>
      </div>
    </Link>
  );
}
export function Empty({
  title = "No scripts yet",
  message = "Publish the first script or adjust your search.",
  action,
}: {
  title?: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Code2 size={32} />
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
export function Registry({
  mode = "search",
  home = false,
  username,
}: {
  mode?: string;
  home?: boolean;
  username?: string;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [website, setWebsite] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RegistryScript[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tag")) setTag(params.get("tag")!);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q,
          limit: home ? "6" : "12",
          page: String(page),
        });
        if (category) params.set("category", category);
        if (tag) params.set("tag", tag);
        if (website) params.set("website", website);
        const res = await fetch(
          `/api/${username ? `users/${username}/scripts` : `registry/${mode}`}?${params}`,
          { signal: controller.signal },
        );
        const result = await res.json();
        if (!res.ok)
          throw new Error(result.error?.message || "Registry unavailable.");
        setItems(result.data);
        setTotal(result.meta.total);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q, category, tag, website, page, mode, home, username]);
  const title =
    mode === "trending"
      ? "Trending scripts"
      : mode === "latest"
        ? "Recently updated"
        : "Explore scripts";
  return (
    <>
      {home ? (
        <>
          <section className="hero">
            <div className="eyebrow">A small script. A better web.</div>
            <h1>
              Your web.
              <br />
              <em>Your scripts.</em>
            </h1>
            <p>
              Discover community userscripts, keep your own library, and run
              them where you need them.
            </p>
            <div className="row">
              <Button asChild>
                <Link href="/explore">
                  Explore scripts
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/launcher">
                  <Rocket size={16} />
                  Get the launcher
                </Link>
              </Button>
            </div>
            <div className="row mt-5 text-xs muted">
              <ShieldCheck size={14} />
              No extension required · Run only when you choose
            </div>
          </section>
          <div className="feature-grid">
            {[
              {
                icon: Library,
                title: "One library, always with you",
                text: "Save private scripts and organize your favorites in collections.",
              },
              {
                icon: Rocket,
                title: "Launch on the page",
                text: "Use a reusable bookmarklet or a short console snippet.",
              },
              {
                icon: Code2,
                title: "Open source, visible code",
                text: "Review permissions and source before installing anything.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="section-heading">
        <div>
          {!home && <div className="eyebrow">THE COMMUNITY REGISTRY</div>}
          <h1 className={home ? "!text-2xl" : ""}>
            {home ? "Fresh from the community" : title}
          </h1>
          <p>
            {home
              ? "Real scripts, published by real people."
              : "Find a little more possibility in the websites you use."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={home ? "/explore" : "/publish"}>
            {home ? "View all" : "Publish a script"}
            <ArrowUpRight size={15} />
          </Link>
        </Button>
      </div>
      {!home && (
        <div className="filters">
          <div className="searchbar">
            <Search size={17} />
            <input
              aria-label="Search scripts"
              placeholder="Search scripts…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {[
              "Utilities",
              "Productivity",
              "Accessibility",
              "Appearance",
              "Developer tools",
              "Privacy",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            className="!w-36"
            aria-label="Filter by tag"
            placeholder="Tag"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
          />
          <input
            className="!w-44"
            aria-label="Supported website"
            placeholder="Website domain"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value);
              setPage(1);
            }}
          />
        </div>
      )}
      {error ? (
        <div role="alert" className="alert error">
          {error} Configure the database if you are running Raxlet locally.
        </div>
      ) : loading ? (
        <div aria-label="Loading scripts" className="grid-cards">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid-cards">
          {items.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      ) : (
        <Empty
          action={
            <Button variant="outline" asChild>
              <Link href="/publish">Publish a script</Link>
            </Button>
          }
        />
      )}{" "}
      {!home && total > 12 && (
        <div className="pagination">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="muted">
            Page {page} of {Math.ceil(total / 12)}
          </span>
          <Button
            variant="outline"
            disabled={page * 12 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
