import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(req:Request) {try{return await auth().handler(req);}catch(e){return errorResponse(e);}}
export {handle as GET,handle as POST};
