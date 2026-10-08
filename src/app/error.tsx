"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>Something went wrong.</h1>
      <p>Try again. If the problem persists, check the server configuration.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
