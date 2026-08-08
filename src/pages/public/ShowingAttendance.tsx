import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Check, Ghost, AlertTriangle } from "lucide-react";

import { useSeo } from "@/hooks/useSeo";
/**
 * Marks a showing as attended / no-show from the "Leasing Agent" calendar feed,
 * without logging into the panel.
 *
 * Why this page exists on the APP domain instead of inside the edge function:
 * Supabase coerces any text/html served from *.supabase.co to text/plain and
 * adds nosniff (anti-phishing). Verified live — text/calendar and
 * application/json survive, text/html does not. So the function speaks JSON and
 * the page lives here.
 *
 * The confirm step is deliberate: mail scanners, link previewers and calendar
 * clients prefetch URLs, so the link only READS. Nothing is recorded until the
 * button is pressed.
 */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL || "https://glzzzthgotfwoiaranmp.supabase.co"}/functions/v1/showing-attendance`;

interface Info {
  state: "confirm" | "already_reported" | "saved";
  who: string;
  where: string;
  when: string;
  attended: boolean;
  already_reported: string | null;
  report?: string;
}

const ERROR_TEXT: Record<string, string> = {
  invalid_or_expired:
    "Este enlace no es válido o ya venció. Los enlaces del calendario caducan a los 120 días.",
  not_found: "No encontramos esa visita.",
  save_failed: "No pudimos guardar el reporte. Probá desde el panel.",
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-5">
    <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
      {children}
    </div>
  </div>
);

const Header = ({ title }: { title: string }) => (
  <div className="bg-gradient-to-br from-[#4F46E5] to-[#6366F1] px-6 py-5">
    <h1 className="text-white text-lg font-bold m-0">{title}</h1>
  </div>
);

const ShowingAttendance = () => {
  // Se abre desde un botón de Telegram con un token en la URL: no se indexa.
  useSeo({ title: "Showing Attendance | Rent Finder Cleveland", noindex: true });
  const [params] = useSearchParams();
  const token = params.get("t") || "";

  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) { setError(ERROR_TEXT.invalid_or_expired); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`${FN_URL}?t=${encodeURIComponent(token)}`);
        const body = await r.json();
        if (body?.error) setError(ERROR_TEXT[body.error] || "No pudimos abrir este enlace.");
        else setInfo(body as Info);
      } catch {
        setError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const confirm = async () => {
    setSaving(true);
    try {
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const body = await r.json();
      if (body?.error) setError(ERROR_TEXT[body.error] || "No pudimos guardar el reporte.");
      else setInfo(body as Info);
    } catch {
      setError("No pudimos guardar el reporte. Revisá tu conexión.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <Header title="Abriendo la visita…" />
        <div className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#4F46E5]" />
        </div>
      </Shell>
    );
  }

  if (error || !info) {
    return (
      <Shell>
        <Header title="Enlace no válido" />
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="m-0">{error}</p>
          </div>
          <p className="text-sm text-slate-500 m-0">
            Podés marcar la asistencia desde el panel o desde el bot de Telegram.
          </p>
        </div>
      </Shell>
    );
  }

  const Details = () => (
    <div className="space-y-1 text-sm text-slate-700">
      <p className="m-0 font-semibold text-slate-900">{info.who}</p>
      <p className="m-0">{info.where}</p>
      <p className="m-0 text-slate-500">{info.when}</p>
    </div>
  );

  if (info.state === "already_reported") {
    return (
      <Shell>
        <Header title="Esta visita ya tiene reporte" />
        <div className="px-6 py-5 space-y-3">
          <Details />
          <p className="text-sm text-slate-600 m-0">
            Ya quedó registrada como <strong>{info.already_reported}</strong>.
          </p>
          <p className="text-sm text-slate-500 m-0">
            No la cambié. Si necesitás corregirla, hacelo desde el panel.
          </p>
        </div>
      </Shell>
    );
  }

  if (info.state === "saved") {
    return (
      <Shell>
        <Header title="Reporte guardado" />
        <div className="px-6 py-5 space-y-3">
          <div className="text-4xl text-center">{info.attended ? "✅" : "👻"}</div>
          <Details />
          <p className="text-sm text-slate-600 m-0">
            Quedó como <strong>{info.report}</strong>. Ya se ve en el panel y en el Leasing Tracker.
          </p>
          <p className="text-sm text-slate-500 m-0">Podés cerrar esta pestaña.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header title={info.attended ? "Marcar como asistió" : "Marcar como no asistió"} />
      <div className="px-6 py-5 space-y-4">
        <Details />
        <button
          onClick={confirm}
          disabled={saving}
          className="w-full h-12 rounded-xl bg-[#4F46E5] hover:bg-[#4F46E5]/90 disabled:opacity-60 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" />
            : info.attended ? <Check className="h-4 w-4" /> : <Ghost className="h-4 w-4" />}
          {info.attended ? "Sí, asistió" : "Confirmar que no asistió"}
        </button>
        <p className="text-xs text-slate-500 m-0 leading-relaxed">
          {info.attended
            ? "Queda registrado en el Leasing Tracker que el dueño ve, y puede disparar el correo de seguimiento si la visita fue hace menos de 48 horas."
            : "Queda registrado como ausencia y se libera el horario."}
        </p>
      </div>
    </Shell>
  );
};

export default ShowingAttendance;
