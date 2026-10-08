import { Suspense } from "react";
import { Authorize } from "@/components/authorize";
export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      <Authorize />
    </Suspense>
  );
}
