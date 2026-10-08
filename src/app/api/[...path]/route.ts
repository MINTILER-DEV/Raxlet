import { route } from "@/lib/service";
import { assertMutationOrigin, errorResponse, limit } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(req:Request,{params}:{params:Promise<{path:string[]}>}) {
  try {
    if(req.method!=="GET")assertMutationOrigin(req);
    const {path}=await params;
    if(path[0]!=="health")await limit(req);
    return await route(req,path);
  } catch(e) {return errorResponse(e);}
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
