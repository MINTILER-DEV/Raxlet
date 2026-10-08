"use client";
import { toast } from "sonner";
import Link from "next/link";
import { api, mutation } from "@/lib/client";
import { useRemote, RequestState } from "./workspace";
import { Button } from "./ui/button";
import { Empty } from "./registry";
type Report = {
  id: string;
  scriptId: string;
  name: string;
  slug: string;
  ownerId: string;
  reason: string;
  hidden: boolean;
  suspended: boolean;
  resolved: boolean;
  createdAt: string;
};
export function Moderation() {
  const { data, error, loading, reload } = useRemote<Report[]>("admin/reports");
  async function act(path: string, input: unknown) {
    try {
      await api(path, mutation("PATCH", input));
      await reload();
      toast.success("Moderation action recorded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">COMMUNITY SAFETY</div>
          <h1>Moderation</h1>
          <p>Review reports, hide harmful scripts, and suspend publishers.</p>
        </div>
      </div>
      <RequestState error={error} loading={loading} />
      {data?.length ? (
        <div className="library-list">
          {data.map((r) => (
            <div className="card" key={r.id}>
              <div className="row between">
                <h3>
                  <Link href={`/scripts/${r.slug}`}>{r.name}</Link>
                </h3>
                <span className="badge">
                  {r.resolved ? "Resolved" : "Open"}
                </span>
              </div>
              <p className="muted whitespace-pre-wrap my-4">{r.reason}</p>
              <div className="row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    act(`admin/scripts/${r.scriptId}`, { hidden: !r.hidden })
                  }
                >
                  {r.hidden ? "Restore script" : "Hide script"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `${r.suspended ? "Restore" : "Suspend"} this publisher?`,
                      )
                    )
                      void act(`admin/users/${r.ownerId}`, {
                        suspended: !r.suspended,
                      });
                  }}
                >
                  {r.suspended ? "Restore publisher" : "Suspend publisher"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    act(`admin/reports/${r.id}`, { resolved: !r.resolved })
                  }
                >
                  {r.resolved ? "Reopen" : "Resolve report"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <Empty
            title="No reports to review."
            message="Community reports will appear here."
          />
        )
      )}
    </>
  );
}
