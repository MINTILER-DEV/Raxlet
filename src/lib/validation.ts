import { z } from "zod";
export const sourceSchema=z.string().min(1).max(500_000);
export const visibilitySchema=z.enum(["public","unlisted","private"]);
export const scriptInput=z.object({source:sourceSchema,visibility:visibilitySchema.default("private"),category:z.string().trim().min(1).max(60).default("Utilities"),tags:z.array(z.string().trim().min(1).max(30)).max(12).default([]),screenshots:z.array(z.url().refine(v=>v.startsWith("https://"),"Screenshots require HTTPS")).max(6).default([]),changelog:z.string().max(4000).default("")}).strict();
export const versionInput=z.object({source:sourceSchema,expectedRevision:z.number().int().positive(),changelog:z.string().max(4000).default("")}).strict();
export const scriptPatch=z.object({visibility:visibilitySchema.optional(),category:z.string().min(1).max(60).optional(),tags:z.array(z.string().min(1).max(30)).max(12).optional(),screenshots:z.array(z.url().refine(v=>v.startsWith("https://"))).max(6).optional(),expectedRevision:z.number().int().positive()}).strict();
export const libraryPatch=z.object({enabled:z.boolean().optional(),pinned:z.boolean().optional(),versionId:z.string().optional(),settings:z.record(z.string().max(100),z.json()).refine(v=>JSON.stringify(v).length<=16000,"Settings limit is 16KB").optional(),confirmed:z.literal(true).optional()}).strict();
export const pagination=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20),q:z.string().max(200).default(""),category:z.string().max(60).optional(),tag:z.string().max(30).optional(),website:z.string().max(250).optional()});
export const profileInput=z.object({username:z.string().regex(/^[a-z0-9][a-z0-9_-]{2,29}$/),bio:z.string().max(1000)}).strict();
