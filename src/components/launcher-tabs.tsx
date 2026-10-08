import Link from "next/link";
export function LauncherTabs({ packed = false }: { packed?: boolean }) {
  return (
    <nav className="row mb-6" aria-label="Launcher modes">
      <Link
        className={`badge ${!packed ? "green" : ""}`}
        href="/dashboard/launcher"
        aria-current={!packed ? "page" : undefined}
      >
        Cloud Mode
      </Link>
      <Link
        className={`badge ${packed ? "green" : ""}`}
        href="/dashboard/launcher/packed"
        aria-current={packed ? "page" : undefined}
      >
        Packed Mode
      </Link>
      <Link className="badge" href="/dashboard/launcher/packed#saved-builds">
        Saved Builds
      </Link>
    </nav>
  );
}
