import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const FALLBACK_URL =
  "https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=CompanyLink";

export default function ApplyRedirect() {
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        // Try to fetch a custom application_url from the org that owns this domain
        const { data } = await supabase
          .from("organization_settings")
          .select("value")
          .eq("key", "application_url")
          .maybeSingle();

        if (cancelled) return;

        const url =
          data?.value && typeof data.value === "string"
            ? data.value
            : typeof data?.value === "object" && data.value !== null && "url" in (data.value as Record<string, unknown>)
              ? (data.value as Record<string, unknown>).url as string
              : FALLBACK_URL;

        window.location.replace(url);
      } catch {
        if (!cancelled) {
          // On any error just go to fallback
          window.location.replace(FALLBACK_URL);
        }
      }
    }

    // Small delay so the user sees the redirect page briefly
    const timer = setTimeout(resolve, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-muted-foreground">Redirecting to application portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <Skeleton className="h-6 w-48 rounded" />
      <p className="text-sm text-muted-foreground animate-pulse">
        Redirecting to application portal...
      </p>
    </div>
  );
}
