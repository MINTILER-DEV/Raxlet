import { headers } from "next/headers";
import { admin, origin } from "@/lib/http";
import { Moderation } from "@/components/moderation";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await admin(new Request(origin(), { headers: await headers() }));
  } catch {
    return (
      <div className="alert error">
        Sign in with an administrator account to review reports.
      </div>
    );
  }
  return <Moderation />;
}
