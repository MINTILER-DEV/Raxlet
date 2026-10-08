import { Suspense } from "react";
import { ScriptEditor } from "@/components/editor";
export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      <ScriptEditor />
    </Suspense>
  );
}
