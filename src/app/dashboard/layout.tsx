import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identity, origin, HttpError } from "@/lib/http";
export const dynamic="force-dynamic";
export default async function Layout({children}:{children:React.ReactNode}) {try{await identity(new Request(origin(),{headers:await headers()}));}catch(e){if(e instanceof HttpError&&e.status===401)redirect("/login");if(e instanceof HttpError&&e.status===403)return <div className="alert error">{e.message}</div>;return <div className="alert error">Configure DATABASE_URL, BETTER_AUTH_URL, and BETTER_AUTH_SECRET to access your workspace.</div>;}return children;}
