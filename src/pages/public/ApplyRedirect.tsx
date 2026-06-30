import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// The live application portal (DoorLoop). This is the permanent apply destination
// for the single domain (see CLAUDE.md — the homeguard.app.doorloop.com DoorLoop
// URL is the live apply portal, not a brand reference).
//
// Note: this component previously tried to read a per-org `application_url` from
// organization_settings, but anonymous RLS always blocked that read, so it always
// fell through to this URL. The dead lookup (and its pointless network round-trip)
// was removed in the 2026-06-30 saneamiento.
const PORTAL_URL =
  "https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=CompanyLink";

export default function ApplyRedirect() {
  useEffect(() => {
    // Small delay so the user sees the redirect page briefly.
    const timer = setTimeout(() => window.location.replace(PORTAL_URL), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <Skeleton className="h-6 w-48 rounded" />
      <p className="text-sm text-muted-foreground animate-pulse">
        Redirecting to application portal...
      </p>
    </div>
  );
}
