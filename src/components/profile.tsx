"use client";
import { toast } from "sonner";
import { api, mutation } from "@/lib/client";
import { useRemote, RequestState } from "./workspace";
import { Registry } from "./registry";
import { Button } from "./ui/button";
export function Profile({ username }: { username: string }) {
  const { data, error, loading } = useRemote<{
    name: string;
    bio: string;
    followers: number;
  }>(`users/${username}`);
  return (
    <>
      <RequestState error={error} loading={loading} />
      {data && (
        <>
          <div className="section-heading">
            <div>
              <div className="eyebrow">COMMUNITY AUTHOR · @{username}</div>
              <h1>{data.name}</h1>
              <p className="whitespace-pre-wrap">
                {data.bio || "A Raxlet community author."}
              </p>
              <p>{data.followers} followers</p>
            </div>
            <div className="row">
              <Button
                onClick={async () => {
                  try {
                    await api(`users/${username}/follow`, mutation("POST"));
                    toast.success("Following author");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Follow author
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api(`users/${username}/follow`, mutation("DELETE"));
                    toast.success("Unfollowed author");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Unfollow
              </Button>
            </div>
          </div>
          <Registry username={username} />
        </>
      )}
    </>
  );
}
