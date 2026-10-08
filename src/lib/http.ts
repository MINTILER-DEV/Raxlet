import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { database } from "@/db";
import { apiRateLimits, user } from "@/db/schema";
import { auth } from "./auth";
export class HttpError extends Error { constructor(public status:number, public code:string, message:string) {super(message);} }
export const fail=(status:number,code:string,message:string):never=>{throw new HttpError(status,code,message);};
export function origin() {return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;}
export function assertMutationOrigin(req:Request) {
  const requestOrigin=req.headers.get("origin");
  if(requestOrigin!==origin()) fail(403,"ORIGIN_REJECTED","Mutations require an Origin header matching the Raxlet website.");
  if(req.headers.get("sec-fetch-site")==="cross-site") fail(403,"CSRF_REJECTED","Cross-site mutations are blocked.");
}
export async function identity(req:Request) {
  const current=await auth().api.getSession({headers:req.headers});
  if(!current) return fail(401,"UNAUTHORIZED","Sign in to continue.");
  const [record]=await database().select().from(user).where(eq(user.id,current.user.id));
  if(!record || record.suspended) return fail(403,"ACCOUNT_SUSPENDED","This account is suspended.");
  return {...record,sessionId:current.session.id};
}
export function isAdmin(id:string) {return (process.env.ADMIN_USER_IDS ?? "").split(",").map(v=>v.trim()).filter(Boolean).includes(id);}
export async function admin(req:Request) {const u=await identity(req); if(!isAdmin(u.id)) fail(403,"FORBIDDEN","Administrator access required."); return u;}
export async function body<T>(req:Request,schema:z.ZodType<T>):Promise<T> {
  if(!req.headers.get("content-type")?.startsWith("application/json")) return fail(415,"CONTENT_TYPE","Use application/json.");
  const reader=req.body?.getReader(); if(!reader) return fail(400,"INVALID_JSON","A JSON body is required.");
  const chunks:Uint8Array[]=[]; let size=0;
  while(true) {const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>600000){await reader.cancel();return fail(413,"BODY_TOO_LARGE","Request exceeds 600KB.");} chunks.push(value);}
  let data:unknown; try{data=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return fail(400,"INVALID_JSON","Invalid JSON body.");}
  return schema.parse(data);
}
export async function limit(req:Request, userId?:string) {
  // Only trust Vercel's overwritten forwarding header on Vercel. Local anonymous traffic shares a bucket.
  const actor=userId ?? (process.env.VERCEL ? req.headers.get("x-vercel-forwarded-for") ?? "anonymous" : "anonymous");
  const key=createHash("sha256").update(actor+":"+(req.method==="GET"?"read":"write")).digest("hex");
  const cap=req.method==="GET"?120:40;
  const [entry]=await database().insert(apiRateLimits).values({key,count:1,resetAt:new Date(Date.now()+60000)}).onConflictDoUpdate({target:apiRateLimits.key,set:{count:sql`case when ${apiRateLimits.resetAt} <= now() then 1 else ${apiRateLimits.count}+1 end`,resetAt:sql`case when ${apiRateLimits.resetAt} <= now() then now() + interval '1 minute' else ${apiRateLimits.resetAt} end`}}).returning();
  if(entry.count>cap) fail(429,"RATE_LIMITED","Too many requests. Try again in a minute.");
}
export const ok=(data:unknown,status=200,meta?:unknown)=>Response.json({data,...(meta?{meta}:{})},{status,headers:{"Cache-Control":"no-store"}});
export function errorResponse(error:unknown) {
  if(error instanceof z.ZodError) return Response.json({error:{code:"VALIDATION_ERROR",message:"Invalid input.",details:error.issues.map(i=>({path:i.path,message:i.message}))}},{status:400});
  if(error instanceof HttpError) return Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:error.status===429?{"Retry-After":"60"}:{}});
  const dbError=error as {code?:string;cause?:{code?:string}};
  if(dbError.code==="23505"||dbError.cause?.code==="23505") return Response.json({error:{code:"CONFLICT",message:"This version, name, or relationship already exists."}},{status:409});
  console.error("Raxlet request failed",error);
  return Response.json({error:{code:"SERVICE_UNAVAILABLE",message:"Service unavailable. Check database configuration and try again."}},{status:503});
}
export const id=()=>randomUUID();
export const visibleTo=(s:{visibility:string;ownerId:string;hidden:boolean},uid?:string)=>s.ownerId===uid || (!s.hidden && s.visibility!=="private");
export const discoverable=(s:{visibility:string;hidden:boolean})=>s.visibility==="public"&&!s.hidden;
export const owned=(ownerId:string,userId:string)=>{if(ownerId!==userId) fail(403,"FORBIDDEN","You do not own this resource.");};
export {and,eq};
