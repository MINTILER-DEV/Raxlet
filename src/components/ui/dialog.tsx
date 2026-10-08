"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content className="dialog-content fixed left-1/2 top-1/2 z-50 w-[min(92vw,600px)] max-h-[85vh] overflow-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
          <DialogPrimitive.Title className="mb-3 text-xl font-semibold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-zinc-400">
            Review this action before continuing.
          </DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="absolute right-4 top-4"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
