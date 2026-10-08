"use client";
import { createAuthClient } from "better-auth/react";
export const authClient=createAuthClient();
export async function api<T=unknown>(path:string,init?:RequestInit):Promise<T> {
  const res=await fetch("/api/"+path,{...init,headers:{"Content-Type":"application/json",...init?.headers}});
  const json=await res.json();if(!res.ok)throw new Error(json.error?.message ?? "Request failed");return json.data;
}
export const mutation=(method:string,data?:unknown):RequestInit=>({method,...(data!==undefined?{body:JSON.stringify(data)}:{})});
