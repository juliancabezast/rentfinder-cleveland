import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, AlertTriangle, CalendarPlus } from "lucide-react";

const FEED_BASE = `${
  import.meta.env.VITE_SUPABASE_URL || "https://glzzzthgotfwoiaranmp.supabase.co"
}/functions/v1/showings-ics`;

/**
 * Shows the "Leasing Agent" iCal feed URL so it can actually be subscribed to.
 * Until now the URL existed but appeared nowhere in the app — it had to be
 * assembled by hand.
 *
 * Admin-only on purpose: the URL is a bearer credential. Anyone holding it can
 * read every applicant's name, phone, email and notes, with no expiry.
 */
export const LeasingAgentCalendarDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "ical_feed_token")
        .maybeSingle();
      const raw = data?.value;
      setToken(raw == null ? null : String(raw).replace(/^"|"$/g, ""));
      setLoading(false);
    })();
  }, [open, orgId]);

  const httpsUrl = token ? `${FEED_BASE}?token=${token}` : "";
  // webcal:// makes Apple Calendar (and Outlook) open the subscribe sheet on a
  // single click instead of downloading a one-shot .ics file.
  const webcalUrl = httpsUrl.replace(/^https:\/\//, "webcal://");

  const copy = async (value: string, which: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast({ title: "No se pudo copiar", description: "Copialo a mano del campo.", variant: "destructive" });
    }
  };

  const UrlRow = ({ label, value, which }: { label: string; value: string; which: string }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-[11px] h-9" onFocus={(e) => e.target.select()} />
        <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => copy(value, which)}>
          {copied === which ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-[#4F46E5]" /> Leasing Agent
          </DialogTitle>
          <DialogDescription>
            Un calendario que se actualiza solo con todos los showings: datos del aplicante,
            renta, nota de la reserva, cómo agendó, link al mapa, y botones para marcar si
            asistió o no.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !token ? (
          <p className="text-sm text-red-600">
            Falta el token del feed (<code>ical_feed_token</code>) en los ajustes de la organización.
          </p>
        ) : (
          <div className="space-y-4">
            <UrlRow label="Para Google Calendar (pegar esta)" value={httpsUrl} which="https" />
            <UrlRow label="Para Apple Calendar / iPhone (abre solo al tocarla)" value={webcalUrl} which="webcal" />

            <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-2">
              <div>
                <p className="font-semibold text-slate-700 m-0">Google Calendar</p>
                <p className="m-0">
                  Otros calendarios → <strong>+</strong> → Suscribirse con URL → pegá la primera → Añadir.
                </p>
              </div>
              <div>
                <p className="font-semibold text-slate-700 m-0">Apple Calendar / iPhone</p>
                <p className="m-0">
                  Archivo → Nueva suscripción de calendario → pegá la segunda →
                  poné <strong>Actualizar: cada 5 minutos</strong>.
                </p>
              </div>
            </div>

            {/* The thing that otherwise reads as "the feed is broken" */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-1.5">
                <p className="m-0">
                  <strong>Google refresca cuando quiere</strong> — normalmente cada 8 a 24 horas.
                  Una reserva nueva puede tardar en aparecer ahí; no está roto. Apple respeta el
                  intervalo que elijas, así que para verlo casi en vivo usá el iPhone.
                </p>
                <p className="m-0">
                  <strong>Esta dirección es una llave.</strong> Quien la tenga puede leer el nombre,
                  teléfono, correo y notas de todos los aplicantes, y hoy no se puede rotar desde
                  el panel. No la compartas ni la pegues en un chat.
                </p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LeasingAgentCalendarDialog;
