import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft, ChevronRight, Phone, MessageSquare, Mail, Send,
  CalendarClock, FileText, Check, Ghost, Loader2, MapPin, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getTimezoneForCity, formatTimeInTimezone, todayInTimezone } from "@/lib/cityTimezone";
import { sendNotificationEmail } from "@/lib/notificationService";
import { renderEmailHtml, DEFAULT_CONFIGS } from "@/lib/emailTemplateDefaults";
import type { EmailTemplatesMap } from "@/lib/emailTemplateDefaults";
import type { TablesUpdate } from "@/integrations/supabase/types";

// Day-focused, action-first list of a single day's showings — the mobile
// Showings view (replaces the slot grid on phones) and a desktop toggle option.
// Sourced from the `showings` table (not the slot grid), each showing rendered
// as a card whose actions reuse existing handlers (no new backend):
//   ✅/👻 quick report · 📞 contact (tel/sms/mailto) · ✉️ templated email ·
//   🔁 manage (reschedule/cancel/edit via the detail dialog) · 📝 full report.

// The agenda day is the ORG's calendar day (Cleveland), not the browser's —
// mirrors ManageSlotsTab, so a traveling admin sees the same day/times as HQ.
const ORG_TZ = "America/New_York";

// UTC instant for a "yyyy-MM-dd" boundary in the org timezone (DST-aware —
// same pattern as ManageSlotsTab.clevelandBoundaryUTC).
const orgBoundaryUTC = (dateStr: string, endOfDay: boolean) => {
  const asUTC = new Date(`${dateStr}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  const offset =
    new Date(asUTC.toLocaleString("en-US", { timeZone: ORG_TZ })).getTime() -
    new Date(asUTC.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(asUTC.getTime() - offset).toISOString();
};

// "yyyy-MM-dd" + n days → "yyyy-MM-dd" (anchored at noon UTC so the calendar
// day never shifts regardless of the browser timezone).
const addDaysStr = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface AgendaShowing {
  id: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number | null;
  lead_id: string;
  lead_name?: string;
  lead_phone?: string | null;
  lead_email?: string | null;
  property_address?: string;
  property_city?: string | null;
  property_full?: string;
}

interface ShowingsAgendaProps {
  reloadSignal?: number;
  onReload?: () => void;
  onOpenReport: (showingId: string, leadId: string, propertyAddress?: string) => void;
  onShowingClick: (showingId: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Agendado", className: "bg-blue-100 text-blue-800 border-blue-200" },
  confirmed: { label: "Confirmado", className: "bg-green-100 text-green-800 border-green-200" },
  completed: { label: "Asistió", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  no_show: { label: "No asistió", className: "bg-orange-100 text-orange-800 border-orange-200" },
};

export const ShowingsAgenda: React.FC<ShowingsAgendaProps> = ({
  reloadSignal = 0, onReload, onOpenReport, onShowingClick,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  const [day, setDay] = useState<string>(() => todayInTimezone(ORG_TZ));
  const [showings, setShowings] = useState<AgendaShowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [contactFor, setContactFor] = useState<AgendaShowing | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [orgName, setOrgName] = useState("Our Team");
  const [templates, setTemplates] = useState<EmailTemplatesMap>({});

  // Reset the send-in-progress guard whenever a fresh contact sheet opens, so a
  // stuck flag from a previous card never disables the next card's send button.
  useEffect(() => { if (contactFor) setSendingEmail(false); }, [contactFor]);

  // Org name + custom email templates (once) — for the ✉️ action.
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ data: org }, { data: tmpl }] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
        supabase.from("organization_settings").select("value").eq("organization_id", orgId).eq("key", "email_templates").maybeSingle(),
      ]);
      if (org?.name) setOrgName(org.name);
      if (tmpl?.value) setTemplates(tmpl.value as EmailTemplatesMap);
    })();
  }, [orgId]);

  const fetchDay = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase.from("showings")
      .select("id, scheduled_at, status, duration_minutes, lead_id, properties(address, unit_number, city, state, zip_code), leads(full_name, phone, email)")
      .eq("organization_id", orgId)
      .in("status", ["scheduled", "confirmed", "completed", "no_show"])
      .gte("scheduled_at", orgBoundaryUTC(day, false))
      .lte("scheduled_at", orgBoundaryUTC(day, true))
      .order("scheduled_at", { ascending: true });
    if (error) {
      // Keep whatever was on screen — a failed fetch must NOT paint the
      // "no showings" empty state (an agent would miss real appointments).
      console.error("Agenda fetch failed:", error);
      toast({ title: "Error", description: "No se pudieron cargar los showings. Intenta de nuevo.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setShowings((data || []).map((s: any) => {
      const p = s.properties || {};
      const full = [p.address, p.unit_number ? `#${p.unit_number}` : "", p.city, p.state, p.zip_code]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      return {
        id: s.id, scheduled_at: s.scheduled_at, status: s.status, duration_minutes: s.duration_minutes,
        lead_id: s.lead_id, lead_name: s.leads?.full_name, lead_phone: s.leads?.phone, lead_email: s.leads?.email,
        property_address: p.address, property_city: p.city ?? null, property_full: full,
      };
    }));
    setLoading(false);
  }, [orgId, day, toast]);

  useEffect(() => { fetchDay(); }, [fetchDay, reloadSignal]);

  // Reload after a quick action. When the parent is wired, onReload bumps
  // reloadSignal, which drives our own fetchDay effect above — so a single
  // round-trip refreshes us and calling fetchDay() here too would double-fetch
  // the day (and flicker the list). Fall back to a local fetch only when there
  // is no parent signal to ride.
  const refresh = () => { if (onReload) onReload(); else fetchDay(); };

  // One-tap outcome report (mirrors ManageSlotsTab.quickReport). The DB trigger
  // owns lead→showed; the agent_report marker clears the "missing report".
  const quickReport = async (s: AgendaShowing, attended: boolean) => {
    if (!orgId) return;
    setBusyId(s.id);
    try {
      const nowIso = new Date().toISOString();
      const upd: TablesUpdate<"showings"> = attended
        ? { status: "completed", completed_at: nowIso, followed_up_at: nowIso }
        : { status: "no_show", followed_up_at: nowIso };
      const { data: cur } = await supabase.from("showings").select("agent_report").eq("organization_id", orgId).eq("id", s.id).maybeSingle();
      if (!cur?.agent_report) upd.agent_report = attended ? "Asistió ✅ (reporte rápido)" : "No asistió 👻 (reporte rápido)";
      const { error } = await supabase.from("showings").update(upd).eq("organization_id", orgId).eq("id", s.id);
      if (error) throw error;
      toast({ title: attended ? "✅ Asistió" : "👻 No asistió", description: "Reporte guardado." });
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "No se pudo guardar.", variant: "destructive" });
    } finally { setBusyId(null); }
  };

  // Templated confirmation/reminder email (reuses the org's showing_confirmation).
  const sendConfirmationEmail = (s: AgendaShowing) => {
    if (sendingEmail) return; // block a double-tap from queueing the email twice
    if (!s.lead_email) { toast({ title: "Sin email", description: "Este lead no tiene email.", variant: "destructive" }); return; }
    setSendingEmail(true);
    const cfg = templates.showing_confirmation || DEFAULT_CONFIGS.showing_confirmation;
    const firstName = (s.lead_name || "").trim().split(" ")[0] || "there";
    // The lead reads this — the time must be the PROPERTY's clock, never the
    // admin's browser clock (a traveling owner would email the wrong hour).
    const propTz = getTimezoneForCity(s.property_city);
    const displayDate = new Date(s.scheduled_at).toLocaleDateString("en-US", {
      timeZone: propTz, weekday: "long", month: "long", day: "numeric",
    }) + " at " + formatTimeInTimezone(s.scheduled_at, propTz);
    const addr = s.property_full || s.property_address || "the property";
    const html = renderEmailHtml(cfg, {
      firstName, fullName: s.lead_name || firstName, propertyAddress: addr, showingDate: displayDate, orgName,
    });
    sendNotificationEmail({
      to: s.lead_email,
      subject: cfg.subject.replace("{propertyAddress}", addr).replace("{showingDate}", displayDate),
      html, notificationType: "showing_confirmation",
      organizationId: orgId, relatedEntityId: s.id, relatedEntityType: "showing", queue: true,
    });
    toast({ title: "✉️ Email en cola", description: `Confirmación para ${s.lead_name || "el lead"}.` });
    setContactFor(null);
  };

  const go = (n: number) => setDay((d) => addDaysStr(d, n));
  const todayStr = todayInTimezone(ORG_TZ);
  // Noon-UTC anchor: format() reads browser-local parts, and noon UTC stays on
  // the same calendar day for any UTC−11…+11 browser, so labels never shift.
  const dayDate = new Date(`${day}T12:00:00Z`);
  const dayShort = day === todayStr ? "Hoy"
    : day === addDaysStr(todayStr, 1) ? "Mañana"
    : day === addDaysStr(todayStr, -1) ? "Ayer"
    : cap(format(dayDate, "EEE d", { locale: es }));
  const isPast = (s: AgendaShowing) => new Date(s.scheduled_at).getTime() < Date.now();
  const reported = (s: AgendaShowing) => s.status === "completed" || s.status === "no_show";

  return (
    <div className="space-y-3">
      {/* Day navigator */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Día anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center flex-1 min-w-0">
          <div className="text-base font-semibold">{dayShort}</div>
          <div className="text-xs text-muted-foreground">{cap(format(dayDate, "EEEE, d 'de' MMMM", { locale: es }))}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Día siguiente">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      {day !== todayStr && (
        <div className="flex justify-center">
          <button onClick={() => setDay(todayInTimezone(ORG_TZ))}
            className="text-xs px-3 py-1 rounded-full text-[#4F46E5] bg-[#4F46E5]/10 hover:bg-[#4F46E5]/20 transition-colors font-medium">
            Volver a hoy
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : showings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay showings este día.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {showings.map((s) => {
            const badge = STATUS_BADGE[s.status] || { label: s.status, className: "bg-slate-100 text-slate-700 border-slate-200" };
            const busy = busyId === s.id;
            const showQuick = isPast(s) && !reported(s);
            // Property-timezone clock (matches the grid + detail dialog).
            const time = formatTimeInTimezone(s.scheduled_at, getTimezoneForCity(s.property_city));
            return (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-2.5">
                  {/* Header — tap to open the full detail dialog */}
                  <button className="w-full flex items-start gap-3 text-left" onClick={() => onShowingClick(s.id)}>
                    <div className="text-center min-w-[3.5rem] shrink-0">
                      <div className="text-lg font-bold text-[#4F46E5] leading-tight">{time.replace(/ ?[AP]M$/i, "")}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{/AM/i.test(time) ? "AM" : "PM"}</div>
                    </div>
                    <div className="flex-1 min-w-0 border-l pl-3">
                      <div className="font-semibold text-sm truncate">{s.lead_name || "Lead"}</div>
                      <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="truncate">{s.property_address || "Dirección N/A"}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${badge.className}`}>{badge.label}</Badge>
                  </button>

                  {/* Quick attendance (past, unreported) */}
                  {showQuick && (
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={busy} onClick={() => quickReport(s, true)}
                        className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Fue</>}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => quickReport(s, false)}
                        className="flex-1 h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                        <Ghost className="h-3.5 w-3.5 mr-1" /> No fue
                      </Button>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[92px]" onClick={() => setContactFor(s)}>
                      <Phone className="h-3.5 w-3.5 mr-1" /> Contactar
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[92px]" onClick={() => onShowingClick(s.id)}>
                      <CalendarClock className="h-3.5 w-3.5 mr-1" /> Gestionar
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1 min-w-[92px]"
                      onClick={() => onOpenReport(s.id, s.lead_id, s.property_address)}>
                      <FileText className="h-3.5 w-3.5 mr-1" /> Reporte
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Contact sheet (bottom) */}
      <Sheet open={!!contactFor} onOpenChange={(o) => !o && setContactFor(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{contactFor?.lead_name || "Lead"}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            {contactFor?.lead_phone && (
              <>
                <Button variant="outline" className="justify-start h-11" asChild>
                  <a href={`tel:${contactFor.lead_phone}`}><Phone className="h-4 w-4 mr-2 text-green-600" /> Llamar <span className="ml-auto text-muted-foreground text-xs">{contactFor.lead_phone}</span></a>
                </Button>
                <Button variant="outline" className="justify-start h-11" asChild>
                  <a href={`sms:${contactFor.lead_phone}`}><MessageSquare className="h-4 w-4 mr-2 text-blue-600" /> Enviar SMS</a>
                </Button>
              </>
            )}
            {contactFor?.lead_email && (
              <>
                <Button variant="outline" className="justify-start h-11" asChild>
                  <a href={`mailto:${contactFor.lead_email}`}><Mail className="h-4 w-4 mr-2 text-slate-600" /> Abrir email <span className="ml-auto text-muted-foreground text-xs truncate max-w-[45%]">{contactFor.lead_email}</span></a>
                </Button>
                <Button className="justify-start h-11 bg-[#4F46E5] hover:bg-[#4F46E5]/90 disabled:opacity-60" disabled={sendingEmail} onClick={() => contactFor && sendConfirmationEmail(contactFor)}>
                  {sendingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Enviar confirmación (plantilla)
                </Button>
              </>
            )}
            {!contactFor?.lead_phone && !contactFor?.lead_email && (
              <p className="text-sm text-muted-foreground text-center py-4">Este lead no tiene teléfono ni email.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
