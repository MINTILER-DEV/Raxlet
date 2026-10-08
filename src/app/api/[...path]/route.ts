import { auth } from "@/lib/auth";
import { route } from "@/lib/service";
import { assertMutationOrigin, errorResponse, limit } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    if (req.method !== "GET") assertMutationOrigin(req);
    const { path } = await params;
    if (path[0] !== "health") {
      const session = req.headers.has("cookie")
        ? await auth().api.getSession({ headers: req.headers })
        : null;
      await limit(req, session?.user.id);
    }
    const response = await route(req, path);
    if (req.method === "GET" && path[0] === "registry")
      response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
