"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Pin,
  Trash2,
  Settings2,
  Search,
  ArrowUpRight,
  Code2,
} from "lucide-react";
import { api, mutation, authClient } from "@/lib/client";
import type { LibraryEntry, Collection, ScriptDetail } from "@/lib/types";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { Empty } from "./registry";
export function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setError("");
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
export function RequestState({
  error,
  loading,
}: {
  error: string;
  loading: boolean;
}) {
  return error ? (
    <p role="alert" className="alert error">
      {error}
    </p>
  ) : loading ? (
    <div className="skeleton" />
  ) : null;
}
export function LibraryPage({ ownedOnly = false }: { ownedOnly?: boolean }) {
  const { data: session } = authClient.useSession();
  const { data, loading, error, reload } = useRemote<LibraryEntry[]>("library");
  const { data: collections } = useRemote<Collection[]>("collections");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<{
    kind: "delete" | "settings" | "update" | "source";
    entry: LibraryEntry;
  } | null>(null);
  const [settings, setSettings] = useState("");
  const [update, setUpdate] = useState<ScriptDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = (data ?? []).filter(
    (e) =>
      (!ownedOnly || e.ownerId === session?.user.id) &&
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      (!filter ||
        collections?.find((c) => c.id === filter)?.entries.includes(e.id)),
  );
  async function patch(e: LibraryEntry, changes: unknown) {
    try {
      await api(`library/${e.id}`, mutation("PATCH", changes));
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function perform() {
    if (!dialog) return;
    setBusy(true);
    try {
      const e = dialog.entry;
      if (dialog.kind === "delete")
        await api(
          ownedOnly ? `scripts/${e.scriptId}` : "library/uninstall",
          mutation("DELETE", ownedOnly ? undefined : { scriptId: e.scriptId }),
        );
      if (dialog.kind === "settings")
        await api(
          `library/${e.id}`,
          mutation("PATCH", { settings: JSON.parse(settings) }),
        );
      if (dialog.kind === "update" && update)
        await api(
          `library/${e.id}`,
          mutation("PATCH", { versionId: update.current.id, confirmed: true }),
        );
      await reload();
      toast.success(
        dialog.kind === "update"
          ? "Updated and disabled. Review before enabling."
          : "Changes saved",
      );
      setDialog(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>{ownedOnly ? "My scripts" : "Your script library"}</h1>
          <p>
            {ownedOnly
              ? "The scripts you write, maintain, and publish."
              : "Your favorites and personal scripts, ready when you are."}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/editor">
            <Plus size={16} />
            New script
          </Link>
        </Button>
      </div>
      <div className="filters">
        <div className="searchbar">
          <Search size={17} />
          <input
            placeholder="Find a script in your library…"
            aria-label="Search your library"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter collection"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All collections</option>
          {collections?.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <RequestState error={error} loading={loading} />
      {!loading &&
        !error &&
        (entries.length ? (
          <div className="library-list">
            {entries.map((e) => (
              <div className="library-row" key={e.id}>
                <Code2 size={23} className="muted" />
                <div className="info">
                  <Link href={`/scripts/${e.slug}`}>
                    <h3>{e.name}</h3>
                  </Link>
                  <p>{e.description}</p>
                  <div className="row mt-2">
                    <span className="badge">v{e.version}</span>
                    <span
                      className={`badge ${e.compatibility.supported ? "green" : "red"}`}
                    >
                      {e.compatibility.supported
                        ? "Supported subset"
                        : "Unsupported APIs"}
                    </span>
                    {ownedOnly && <span className="badge">{e.visibility}</span>}
                  </div>
                </div>
                <div className="row">
                  <button
                    role="switch"
                    aria-checked={e.enabled}
                    aria-label={`Enable ${e.name}`}
                    className="toggle"
                    onClick={() => patch(e, { enabled: !e.enabled })}
                  />
                  <button
                    className={e.pinned ? "text-lime-400" : "muted"}
                    aria-label={`${e.pinned ? "Unpin" : "Pin"} ${e.name}`}
                    onClick={() => patch(e, { pinned: !e.pinned })}
                  >
                    <Pin size={16} />
                  </button>
                  <button
                    aria-label={`Configure ${e.name}`}
                    className="muted"
                    onClick={() => {
                      setSettings(JSON.stringify(e.settings, null, 2));
                      setDialog({ kind: "settings", entry: e });
                    }}
                  >
                    <Settings2 size={17} />
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ kind: "source", entry: e })}
                  >
                    Source
                  </Button>
                  {e.latestRevision > e.revision && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setUpdate(null);
                        setDialog({ kind: "update", entry: e });
                        try {
                          setUpdate(
                            await api<ScriptDetail>(`scripts/${e.scriptId}`),
                          );
                        } catch (err) {
                          toast.error((err as Error).message);
                          setDialog(null);
                        }
                      }}
                    >
                      Review update
                    </Button>
                  )}
                  {ownedOnly && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/editor?id=${e.scriptId}`}>
                        Edit
                      </Link>
                    </Button>
                  )}
                  <button
                    className="muted"
                    aria-label={`${ownedOnly ? "Delete" : "Uninstall"} ${e.name}`}
                    onClick={() => setDialog({ kind: "delete", entry: e })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={
              ownedOnly
                ? "Your next idea starts here."
                : "A home for your scripts."
            }
            message="Create your first userscript or install one from the registry."
            action={
              <Button asChild variant="outline">
                <Link href={ownedOnly ? "/dashboard/editor" : "/explore"}>
                  {ownedOnly ? "Open the editor" : "Explore the registry"}
                  <ArrowUpRight size={15} />
                </Link>
              </Button>
            }
          />
        ))}
      <ConfirmDialog
        open={!!dialog}
        onOpenChange={(v) => !v && setDialog(null)}
        title={
          dialog?.kind === "delete"
            ? `${ownedOnly ? "Delete" : "Uninstall"} ${dialog.entry.name}?`
            : dialog?.kind === "settings"
              ? "Script settings"
              : dialog?.kind === "source"
                ? "Installed source"
                : "Review script update"
        }
      >
        {dialog?.kind === "delete" ? (
          <>
            <p className="muted mb-5">
              {ownedOnly
                ? "This deletes the script and all its versions, including other users' installations."
                : "This removes the script from your library and collections."}
            </p>
            <Button variant="destructive" disabled={busy} onClick={perform}>
              {ownedOnly ? "Delete script" : "Uninstall"}
            </Button>
          </>
        ) : dialog?.kind === "settings" ? (
          <>
            <p className="muted text-xs mb-3">
              JSON values used by GM_getValue and GM_setValue. Maximum 16KB.
            </p>
            <textarea
              className="mono !min-h-64"
              value={settings}
              onChange={(e) => setSettings(e.target.value)}
              aria-label="Settings JSON"
            />
            <Button disabled={busy} className="mt-4" onClick={perform}>
              Save settings
            </Button>
          </>
        ) : dialog?.kind === "source" ? (
          <pre className="source-view">
            <code>{dialog.entry.source}</code>
          </pre>
        ) : (
          <>
            {update ? (
              <>
                <p className="muted mb-3">
                  v{dialog?.entry.version} → v{update.current.version}. Updating
                  disables the script until you enable it again.
                </p>
                <p className="mono text-xs mb-3">
                  Permissions:{" "}
                  {update.current.compatibility.grants.join(", ") || "none"}
                </p>
                <p className="muted whitespace-pre-wrap">
                  {update.current.changelog}
                </p>
                <pre className="source-view !max-h-72">
                  <code>{update.current.source}</code>
                </pre>
                <Button disabled={busy} className="mt-4" onClick={perform}>
                  Confirm reviewed update
                </Button>
              </>
            ) : (
              <p className="muted">Loading version…</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
export function CollectionsPage() {
  const {
    data: collections,
    error,
    loading,
    reload,
  } = useRemote<Collection[]>("collections");
  const { data: entries } = useRemote<LibraryEntry[]>("library");
  const [name, setName] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [remove, setRemove] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(path: string, method: string, data?: unknown) {
    try {
      await api(path, mutation(method, data));
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">A PLACE FOR EVERYTHING</div>
          <h1>Collections</h1>
          <p>Group scripts by project, website, or the way you work.</p>
        </div>
      </div>
      <form
        className="row mb-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await change("collections", "POST", { name });
          setName("");
          setBusy(false);
        }}
      >
        <input
          className="!max-w-sm"
          aria-label="New collection name"
          required
          maxLength={80}
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button disabled={busy}>
          <Plus size={15} />
          Create collection
        </Button>
      </form>
      <RequestState error={error} loading={loading} />
      {collections?.length ? (
        <div className="grid-cards">
          {collections.map((c) => (
            <div className="card" key={c.id}>
              <div className="row between">
                <button
                  onClick={() => {
                    setActive(c.id);
                    setName(c.name);
                  }}
                >
                  <h3>{c.name}</h3>
                </button>
                <button
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setRemove(c)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="muted text-xs mt-2">{c.entries.length} scripts</p>
              <Button
                className="mt-5"
                variant="outline"
                size="sm"
                onClick={() => {
                  setActive(c.id);
                  setName(c.name);
                }}
              >
                Manage collection
              </Button>
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <Empty
            title="Make room for your workflow."
            message="Create a collection and add scripts from your library."
          />
        )
      )}
      <ConfirmDialog
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        title="Manage collection"
      >
        <form
          className="row mb-5"
          onSubmit={async (e) => {
            e.preventDefault();
            await change(`collections/${active}`, "PATCH", { name });
            toast.success("Collection renamed");
          }}
        >
          <input
            aria-label="Rename collection"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
            required
            maxLength={80}
          />
          <Button variant="outline">Rename</Button>
        </form>
        <div className="form-stack">
          {entries?.map((e) => (
            <label className="row" key={e.id}>
              <input
                type="checkbox"
                checked={
                  collections
                    ?.find((c) => c.id === active)
                    ?.entries.includes(e.id) ?? false
                }
                onChange={(ev) =>
                  change(
                    `collections/${active}/entries`,
                    ev.target.checked ? "POST" : "DELETE",
                    { libraryId: e.id },
                  )
                }
              />
              {e.name}
            </label>
          ))}
          {!entries?.length && (
            <p className="muted">Install or create a script first.</p>
          )}
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Delete collection?"
      >
        <p className="muted mb-4">
          Your library scripts will remain installed.
        </p>
        <Button
          variant="destructive"
          onClick={async () => {
            await change(`collections/${remove?.id}`, "DELETE");
            setRemove(null);
          }}
        >
          Delete collection
        </Button>
      </ConfirmDialog>
    </>
  );
}
export function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useRemote<
    {
      id: string;
      action: string;
      resourceId: string | null;
      createdAt: string;
    }[]
  >(`activity?page=${page}&limit=25`);
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE PAPER TRAIL</div>
          <h1>Your activity</h1>
          <p>Your installations, publishing, and library changes.</p>
        </div>
      </div>
      <RequestState error={error} loading={loading} />
      {data?.length ? (
        <div className="card overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td>{e.action.replaceAll(".", " · ")}</td>
                  <td className="mono muted">{e.resourceId || "—"}</td>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading &&
        !error && (
          <Empty
            title="Your story starts here."
            message="Install or publish a script to see activity."
          />
        )
      )}
      <div className="pagination">
        <Button
          disabled={page === 1}
          variant="outline"
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          disabled={!data || data.length < 25}
          variant="outline"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
export function SettingsPage() {
  const { data, error, loading, reload } = useRemote<{
    username: string | null;
    bio: string;
    email: string;
    admin: boolean;
  }>("users/me");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Account settings</h1>
          <p>Your public profile and account security.</p>
        </div>
      </div>
      <RequestState error={error} loading={loading} />
      {data && (
        <div className="grid-cards !grid-cols-1 max-w-2xl">
          <form
            key={data.username}
            className="card form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api(
                  "users/me",
                  mutation("PATCH", {
                    username: f.get("username"),
                    bio: f.get("bio"),
                  }),
                );
                toast.success("Profile saved");
                await reload();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Public author profile</h3>
            <label>
              Username
              <input
                name="username"
                defaultValue={data.username ?? ""}
                required
                pattern="[a-z0-9][a-z0-9_-]{2,29}"
                minLength={3}
                maxLength={30}
              />
            </label>
            <label>
              Bio
              <textarea name="bio" defaultValue={data.bio} maxLength={1000} />
            </label>
            <p className="muted text-xs">
              Your email stays private: {data.email}
            </p>
            <Button disabled={busy}>Save profile</Button>
            {data.username && (
              <Link className="muted text-xs" href={`/users/${data.username}`}>
                View public profile ↗
              </Link>
            )}
            {data.admin && (
              <Link className="text-lime-400" href="/admin">
                Open moderation
              </Link>
            )}
          </form>
          <form
            className="card form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              setBusy(true);
              try {
                const res = await authClient.changePassword({
                  currentPassword: String(f.get("current")),
                  newPassword: String(f.get("password")),
                  revokeOtherSessions: true,
                });
                if (res.error) throw new Error(res.error.message);
                toast.success("Password changed; other sessions revoked");
                form.reset();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Change password</h3>
            <label>
              Current password
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <Button disabled={busy} variant="outline">
              Update password
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

export function OwnScriptsPage() {
  const { data, error, loading, reload } =
    useRemote<ScriptDetail[]>("users/me/scripts");
  const [remove, setRemove] = useState<ScriptDetail | null>(null);
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>My scripts</h1>
          <p>
            Every script you author, including scripts removed from your
            library.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/editor">
            <Plus size={16} />
            New script
          </Link>
        </Button>
      </div>
      <RequestState error={error} loading={loading} />
      {data?.length ? (
        <div className="library-list">
          {data.map((s) => (
            <div className="library-row" key={s.id}>
              <Code2 size={23} className="muted" />
              <div className="info">
                <Link href={`/scripts/${s.slug}`}>
                  <h3>{s.name}</h3>
                </Link>
                <p>{s.description}</p>
                <span className="badge mt-2">
                  {s.visibility} · revision {s.revision}
                </span>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/dashboard/editor?id=${s.id}`}>Edit</Link>
              </Button>
              <button
                aria-label={`Delete ${s.name}`}
                onClick={() => setRemove(s)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <Empty
            title="Your next idea starts here."
            message="Create your first userscript in the Monaco editor."
            action={
              <Button asChild>
                <Link href="/dashboard/editor">Open the editor</Link>
              </Button>
            }
          />
        )
      )}
      <ConfirmDialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Delete this script?"
      >
        <p className="muted mb-5">
          This deletes all versions and other users’ library installations. This
          cannot be undone.
        </p>
        <Button
          variant="destructive"
          onClick={async () => {
            try {
              await api(`scripts/${remove?.id}`, mutation("DELETE"));
              setRemove(null);
              await reload();
              toast.success("Script deleted");
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Delete script
        </Button>
      </ConfirmDialog>
    </>
  );
}
