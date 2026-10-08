import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants=cva("inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400",{variants:{variant:{default:"bg-lime-400 text-zinc-950 hover:bg-lime-300",outline:"border border-zinc-700 bg-transparent hover:bg-zinc-800",ghost:"hover:bg-zinc-800",destructive:"bg-red-600 text-white hover:bg-red-500"},size:{default:"h-10 px-4 py-2",sm:"h-8 px-3",icon:"h-10 w-10"}},defaultVariants:{variant:"default",size:"default"}});
export function Button({className,variant,size,asChild=false,...props}:React.ComponentProps<"button"> & VariantProps<typeof variants> & {asChild?:boolean}) {const Comp=asChild?Slot:"button";return <Comp className={cn(variants({variant,size,className}))} {...props}/>;}
