import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/dashboard/StatCard";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  Search,
  SearchX,
  MapPin,
  Users,
  CalendarClock,
  CheckCircle2,
  TrendingUp,
  BedDouble,
  Bath,
  Ruler,
  ArrowLeft,
  Loader2,
  Building2,
  ShieldCheck,
  Info,
  CalendarDays,
  CalendarPlus,
  Zap,
  Globe,
  Layers,
  MessageSquareQuote,
  Activity,
  PhoneCall,
  PhoneMissed,
  Send,
  RotateCcw,
  Flag,
  Target,
  XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
type Lang = "es" | "en";

interface PropertyCard {
  key: string;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  units: number;
  status: string;
  section_8_accepted: boolean;
  rent_min: number | null;
  rent_max: number | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  photo: string | null;
}

interface OpenSlot {
  id: string;
  slot_date: string;
  slot_time: string;
  duration_minutes: number | null;
}

interface TrackerData {
  property: {
    key: string;
    address: string;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    units: number;
    unit_numbers: string[];
    bedrooms_min: number | null;
    bedrooms_max: number | null;
    bathrooms_min: number | null;
    bathrooms_max: number | null;
    square_feet_total: number | null;
    rent_min: number | null;
    rent_max: number | null;
    status: string;
    unit_statuses: {
      unit_number: string | null;
      status: string;
      rent_price: number | null;
    }[];
    section_8_accepted: boolean;
    listed_date: string | null;
    photo: string | null;
  };
  summary: {
    total_leads: number;
    units: number;
    showings_total: number;
    showings_completed: number;
    showings_upcoming: number;
    open_slots_upcoming: number;
    days_on_market: number | null;
    leads_last_30d?: number;
    first_lead_at: string | null;
    last_lead_at: string | null;
    response_median_minutes?: number | null;
    response_pct_under_1h?: number | null;
  };
  funnel: { stage: string; count: number }[];
  lead_sources: { source: string; count: number }[];
  leads_over_time: { month: string; label: string; count: number }[];
  showings_by_status: { status: string; count: number }[];
  showings_timeline: {
    id: string;
    scheduled_at: string | null;
    status: string;
    interest_level: string | null;
    is_upcoming: boolean;
  }[];
  agent_comments: {
    id: string;
    date: string | null;
    interest_level: string | null;
    unit_number: string | null;
    comment: string;
  }[];
  // Typed action codes only — the label is rendered here, so no prospect data
  // ever reaches this page (see the leasing_activity migration).
  leasing_activity?: {
    last_30d: {
      contacts: number;
      messages: number;
      follow_ups: number;
      showings_confirmed: number;
    };
    recent: { id: string; action: string; created_at: string }[];
  } | null;
  open_slots: {
    upcoming_count: number;
    past_count: number;
    upcoming: OpenSlot[];
  };
  global?: {
    total_leads: number;
    leads_7d: number;
    leads_prev_7d: number;
  } | null;
}

interface CityAgenda {
  city: string;
  slots: number;
  properties: number;
  next_date: string;
  dates?: string[];
}

const MIN_CHARS = 4;

// ── i18n ──────────────────────────────────────────────────────────────
const STRINGS = {
  es: {
    brand: "Rent Finder Cleveland",
    eyebrow: "Seguimiento de Leasing",
    title: "Sigue en vivo la actividad de leasing de tu propiedad",
    subtitle:
      "Consulta en tiempo real cómo avanza el arrendamiento de tu propiedad. Escribe el número o la dirección y elígela de la lista para ver todo el detalle.",
    placeholder: "Escribe aquí… ej. 1234 Main St · Main · 44101",
    searchBtn: "Buscar",
    newSearch: "Nueva búsqueda",
    hint: `Escribe al menos ${MIN_CHARS} caracteres y elige tu propiedad de la lista.`,
    whatYouFind: "Lo que encontrarás aquí",
    features: [
      {
        title: "Personas interesadas",
        desc: "Cuántos prospectos han consultado por tu propiedad y en qué etapa del proceso están.",
      },
      {
        title: "Visitas (showings)",
        desc: "Las visitas ya realizadas con su fecha y las que están agendadas próximamente.",
      },
      {
        title: "Horarios disponibles",
        desc: "Los cupos abiertos en la agenda para que se agenden nuevas visitas.",
      },
      {
        title: "Notas del agente",
        desc: "El feedback que deja nuestro agente de arrendamiento después de cada visita.",
      },
    ],
    agendaTitle: "Agenda abierta de visitas",
    agendaSubtitle:
      "Estas ciudades tienen visitas disponibles para agendar ahora mismo. Busca tu propiedad para ver y reservar los cupos.",
    agendaMoreDates: (n: number) => `+${n} más`,
    searching: "Buscando…",
    noMatch: "Ninguna propiedad coincide con",
    unit: (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`),
    perMonth: "/mes",
    totalLeads: "Leads totales",
    totalLeadsSub: "prospectos interesados",
    showingsDone: "Showings realizados",
    showingsDoneSub: (n: number) => `${n} agendados en total`,
    responseSpeed: "Velocidad de respuesta",
    responseSpeedSub: "primera respuesta",
    responseSpeedSub2: (pct: number) => `${pct}% en menos de 1 hora`,
    recentLeads: "Interesados recientes",
    recentLeadsSub: "últimos 30 días",
    recentLeadsSub2: (last: string) => `última consulta: ${last}`,
    lastToday: "hoy",
    lastYesterday: "ayer",
    lastDaysAgo: (n: number) => `hace ${n} días`,
    pipeline: "Pipeline de leads",
    pipelineSub: "Prospectos por etapa actual",
    leadsOverTime: "Leads en el tiempo",
    leadsOverTimeSub: "Consultas nuevas por mes",
    leadsSeries: "Leads",
    sources: "Origen de los leads",
    sourcesSub: "De dónde vinieron los prospectos",
    showingsByStatus: "Showings por estado",
    showingsByStatusSub: "Todos los tours agendados a la fecha",
    activity: "Actividad de gestión",
    activitySub: "El trabajo que nuestro equipo hizo sobre tu propiedad",
    activity30d: "últimos 30 días",
    activityContacts: "contactos",
    activityMessages: "mensajes enviados",
    activityFollowUps: "seguimientos agendados",
    activityConfirmed: "showings confirmados",
    activityRecent: "Últimos movimientos",
    activityEmpty: "Todavía no hay actividad registrada para esta propiedad",
    activityNow: "recién",
    activityHoursAgo: (n: number) => `hace ${n} h`,
    actionLabels: {
      contacted: "Se contactó a un prospecto",
      contact_attempt: "Llamada sin respuesta",
      follow_up_scheduled: "Se agendó un seguimiento",
      message_sent_sms: "Se envió un SMS",
      message_sent_email: "Se envió un email",
      showing_confirmed: "Se confirmó un showing",
      showing_reschedule_requested: "Se gestionó una reprogramación",
      showing_attended: "Un prospecto asistió a la visita",
      showing_no_show: "Un prospecto no asistió",
      lead_not_interested: "Prospecto no interesado",
      stage_changed: "Se actualizó la etapa de un prospecto",
    } as Record<string, string>,
    timeline: "Showings y notas del agente",
    timelineSub: "Próximas visitas e historial, con el comentario del agente de cada tour",
    upcoming: "Próximos",
    history: "Historial",
    openAvailability: "Disponibilidad abierta",
    openAvailabilitySub: (up: number, past: number) =>
      `${up} cupos próximos · ${past} pasados`,
    openSlotsMore: (n: number) => `+${n} cupos más`,
    noOpenSlots: "No hay cupos abiertos próximos para esta propiedad",
    minutes: "min",
    commentUnit: (u: string) => `Unidad ${u}`,
    interest: (lvl: string) => `Interés ${lvl}`,
    noShowings: "Aún no hay showings agendados para esta propiedad",
    noLeads: "Todavía no hay leads para esta propiedad",
    noSources: "Sin orígenes de leads aún",
    noShowingsBooked: "Sin showings agendados aún",
    section8: "Acepta Sección 8",
    unitsLabel: (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`),
    bd: "hab",
    ba: "baños",
    sqft: "sqft total",
    privacy:
      "Por privacidad, nunca se muestran nombres ni datos de contacto de los prospectos. Los prospectos que pasaron a la etapa de solicitud quedan excluidos de estas cifras.",
    globalLive: "Sistema en línea · datos en tiempo real",
    globalLabel: "prospectos gestionados en nuestro sistema",
    globalWeek: (n: number) => `+${n} esta semana`,
    globalVsPrev: (p: number) => `+${p}% vs. la semana anterior`,
    poweredBy: "Con tecnología de Rent Finder Cleveland",
    langTitle: "Idioma / Language",
    stages: {
      Inquiries: "Consultas",
      Engaged: "En conversación",
      "Showing Scheduled": "Showing agendado",
      Toured: "Visitó",
    } as Record<string, string>,
    propStatus: {
      available: "Disponible",
      coming_soon: "Próximamente",
      in_leasing_process: "En proceso",
      rented: "Alquilado",
    } as Record<string, string>,
    showStatus: {
      scheduled: "Agendado",
      confirmed: "Confirmado",
      completed: "Realizado",
      no_show: "No asistió",
      cancelled: "Cancelado",
      rescheduled: "Reprogramado",
    } as Record<string, string>,
    interestLvl: { high: "alto", medium: "medio", low: "bajo" } as Record<
      string,
      string
    >,
    locale: "es-ES",
  },
  en: {
    brand: "Rent Finder Cleveland",
    eyebrow: "Leasing Tracker",
    title: "Follow your property's leasing activity live",
    subtitle:
      "See in real time how your property's leasing is progressing. Type its street number or address and pick it from the list to see the full picture.",
    placeholder: "Type here… e.g. 1234 Main St · Main · 44101",
    searchBtn: "Search",
    newSearch: "New search",
    hint: `Type at least ${MIN_CHARS} characters, then pick your property from the list.`,
    whatYouFind: "What you'll find here",
    features: [
      {
        title: "Interested prospects",
        desc: "How many prospects have inquired about your property and what stage they're in.",
      },
      {
        title: "Showings",
        desc: "Tours already completed with their date, plus the ones coming up next.",
      },
      {
        title: "Open time slots",
        desc: "The open slots on the agenda where new tours can be booked.",
      },
      {
        title: "Agent notes",
        desc: "The feedback our leasing agent leaves after each tour.",
      },
    ],
    agendaTitle: "Open showing availability",
    agendaSubtitle:
      "These cities have visits open to book right now. Search your property to see and reserve its slots.",
    agendaMoreDates: (n: number) => `+${n} more`,
    searching: "Searching…",
    noMatch: "No property matches",
    unit: (n: number) => (n === 1 ? "1 unit" : `${n} units`),
    perMonth: "/mo",
    totalLeads: "Total Leads",
    totalLeadsSub: "interested prospects",
    showingsDone: "Showings Done",
    showingsDoneSub: (n: number) => `${n} total booked`,
    responseSpeed: "Response Speed",
    responseSpeedSub: "median first reply",
    responseSpeedSub2: (pct: number) => `${pct}% within 1 hour`,
    recentLeads: "Recent Prospects",
    recentLeadsSub: "last 30 days",
    recentLeadsSub2: (last: string) => `latest inquiry: ${last}`,
    lastToday: "today",
    lastYesterday: "yesterday",
    lastDaysAgo: (n: number) => `${n} days ago`,
    pipeline: "Lead Pipeline",
    pipelineSub: "Prospects by current stage",
    leadsOverTime: "Leads Over Time",
    leadsOverTimeSub: "New inquiries per month",
    leadsSeries: "Leads",
    sources: "Lead Sources",
    sourcesSub: "Where prospects came from",
    showingsByStatus: "Showings by Status",
    showingsByStatusSub: "All tours booked to date",
    activity: "Leasing Activity",
    activitySub: "The work our team put into your property",
    activity30d: "last 30 days",
    activityContacts: "contacts",
    activityMessages: "messages sent",
    activityFollowUps: "follow-ups scheduled",
    activityConfirmed: "showings confirmed",
    activityRecent: "Latest moves",
    activityEmpty: "No activity recorded for this property yet",
    activityNow: "just now",
    activityHoursAgo: (n: number) => `${n}h ago`,
    actionLabels: {
      contacted: "A prospect was contacted",
      contact_attempt: "Call with no answer",
      follow_up_scheduled: "A follow-up was scheduled",
      message_sent_sms: "An SMS was sent",
      message_sent_email: "An email was sent",
      showing_confirmed: "A showing was confirmed",
      showing_reschedule_requested: "A reschedule was handled",
      showing_attended: "A prospect attended the tour",
      showing_no_show: "A prospect did not attend",
      lead_not_interested: "Prospect not interested",
      stage_changed: "A prospect's stage was updated",
    } as Record<string, string>,
    timeline: "Showings & Agent Notes",
    timelineSub: "Upcoming and past tours, with the agent's note for each",
    upcoming: "Upcoming",
    history: "History",
    openAvailability: "Open Availability",
    openAvailabilitySub: (up: number, past: number) =>
      `${up} upcoming slots · ${past} past`,
    openSlotsMore: (n: number) => `+${n} more slots`,
    noOpenSlots: "No upcoming open slots for this property",
    minutes: "min",
    commentUnit: (u: string) => `Unit ${u}`,
    interest: (lvl: string) => `${lvl} interest`,
    noShowings: "No showings scheduled for this property yet",
    noLeads: "No leads for this property yet",
    noSources: "No lead sources yet",
    noShowingsBooked: "No showings booked yet",
    section8: "Section 8 Accepted",
    unitsLabel: (n: number) => (n === 1 ? "1 unit" : `${n} units`),
    bd: "bd",
    ba: "ba",
    sqft: "sqft total",
    privacy:
      "For privacy, individual prospect names and contact details are never shown here. Prospects who have moved into the application stage are excluded from these figures.",
    globalLive: "System online · real-time data",
    globalLabel: "prospects managed across our system",
    globalWeek: (n: number) => `+${n} this week`,
    globalVsPrev: (p: number) => `+${p}% vs. last week`,
    poweredBy: "Powered by Rent Finder Cleveland",
    langTitle: "Language / Idioma",
    stages: {
      Inquiries: "Inquiries",
      Engaged: "Engaged",
      "Showing Scheduled": "Showing Scheduled",
      Toured: "Toured",
    } as Record<string, string>,
    propStatus: {
      available: "Available",
      coming_soon: "Coming Soon",
      in_leasing_process: "In Leasing",
      rented: "Rented",
    } as Record<string, string>,
    showStatus: {
      scheduled: "Scheduled",
      confirmed: "Confirmed",
      completed: "Completed",
      no_show: "No Show",
      cancelled: "Cancelled",
      rescheduled: "Rescheduled",
    } as Record<string, string>,
    interestLvl: { high: "high", medium: "medium", low: "low" } as Record<
      string,
      string
    >,
    locale: "en-US",
  },
};
type T = typeof STRINGS.es;

// ── Style constants (iOS-26 indigo/gold design system) ────────────────
const CHART_COLORS = [
  "#4F46E5", "#6366F1", "#818CF8", "#FFB22C",
  "#22C55E", "#38BDF8", "#F472B6", "#F59E0B",
];
const FUNNEL_COLORS = ["#4F46E5", "#6366F1", "#FFB22C", "#22C55E"];
const STATUS_DOT: Record<string, string> = {
  available: "bg-green-500",
  coming_soon: "bg-amber-500",
  in_leasing_process: "bg-blue-500",
  rented: "bg-gray-400",
  scheduled: "bg-blue-500",
  confirmed: "bg-green-500",
  completed: "bg-[#4F46E5]",
  no_show: "bg-red-500",
  cancelled: "bg-gray-400",
  rescheduled: "bg-amber-500",
};
const SHOWING_STATUS_COLORS: Record<string, string> = {
  scheduled: "#3B82F6",
  confirmed: "#22C55E",
  completed: "#4F46E5",
  rescheduled: "#F59E0B",
  cancelled: "#94A3B8",
  no_show: "#EF4444",
};
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: "12px",
  boxShadow: "0 8px 30px rgba(0,0,0,0.10)",
  fontSize: 12,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────
const CENTRAL_STATES = new Set(["WI", "IL", "MO", "MN", "IA", "KS", "NE", "OK", "AR", "TX"]);
function tzForState(state?: string | null): string {
  return state && CENTRAL_STATES.has(state.toUpperCase())
    ? "America/Chicago"
    : "America/New_York";
}

function money(n: number | null | undefined, locale: string): string {
  if (n === null || n === undefined) return "—";
  return `$${Number(n).toLocaleString(locale)}`;
}

function rentRange(min: number | null, max: number | null, locale: string): string {
  if (min === null && max === null) return "—";
  if (min === max || max === null) return money(min, locale);
  if (min === null) return money(max, locale);
  return `${money(min, locale)}–${money(max, locale)}`;
}

function numRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min === max || max === null) return `${min}`;
  if (min === null) return `${max}`;
  return `${min}–${max}`;
}

function prettifySource(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function formatMonth(monthKey: string, locale: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function showingDateTime(iso: string | null, tz: string, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: tz,
  });
}

// "hoy" / "ayer" / "hace N días" for the latest inquiry, using the property's
// timezone so calendar-day boundaries match what the owner expects.
function lastInquiryLabel(iso: string | null, tz: string, t: T): string {
  if (!iso) return "—";
  const dayStr = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const today = dayStr(new Date());
  const that = dayStr(new Date(iso));
  if (that >= today) return t.lastToday;
  const diff = Math.round((Date.parse(today) - Date.parse(that)) / 86400000);
  return diff === 1 ? t.lastYesterday : t.lastDaysAgo(diff);
}

// Relative age for the activity feed: minutes → hours → the same calendar-day
// wording the latest-inquiry line already uses, so both read alike.
function activityAgo(iso: string, tz: string, t: T): string {
  const ms = Date.now() - Date.parse(iso);
  if (ms < 3_600_000) return t.activityNow;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return t.activityHoursAgo(hours);
  return lastInquiryLabel(iso, tz, t);
}

// One icon + tone per action code. Attempts that didn't land (no answer, not
// interested) stay muted rather than red — they're effort, not failures.
const ACTION_STYLE: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  contacted: { icon: PhoneCall, tone: "text-[#4F46E5] bg-[#4F46E5]/10" },
  contact_attempt: { icon: PhoneMissed, tone: "text-slate-500 bg-slate-500/10" },
  follow_up_scheduled: { icon: RotateCcw, tone: "text-[#4F46E5] bg-[#4F46E5]/10" },
  message_sent_sms: { icon: Send, tone: "text-sky-600 bg-sky-500/10" },
  message_sent_email: { icon: Send, tone: "text-sky-600 bg-sky-500/10" },
  showing_confirmed: { icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
  showing_reschedule_requested: { icon: CalendarClock, tone: "text-amber-600 bg-amber-500/10" },
  showing_attended: { icon: Flag, tone: "text-emerald-600 bg-emerald-500/10" },
  showing_no_show: { icon: XCircle, tone: "text-slate-500 bg-slate-500/10" },
  lead_not_interested: { icon: XCircle, tone: "text-slate-500 bg-slate-500/10" },
  stage_changed: { icon: Target, tone: "text-[#4F46E5] bg-[#4F46E5]/10" },
};

function formatSlot(slot: OpenSlot, locale: string): { date: string; time: string } {
  const [y, m, d] = slot.slot_date.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const [hh, mm] = slot.slot_time.split(":").map(Number);
  const time = new Date(Date.UTC(2000, 0, 1, hh, mm)).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return { date, time };
}

// Format a bare YYYY-MM-DD (no time) as a prominent long date for the
// city-agenda banner, e.g. "sábado, 4 de julio" / "Saturday, July 4".
function formatDateLong(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// Compact date for the extra agenda dates, e.g. "sáb, 19 jul" / "Sat, Jul 19".
function formatDateShort(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Translated status pill (color dot + label) — replaces the app StatusBadge
// so the labels honour the selected language.
function StatusPill({
  status,
  kind,
  t,
  className,
}: {
  status: string;
  kind: "propStatus" | "showStatus";
  t: T;
  className?: string;
}) {
  const label = t[kind][status] || prettifySource(status);
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[status] || "bg-gray-400")} />
      {label}
    </Badge>
  );
}

// Icons for the "what you'll find" feature cards (zipped with t.features).
const FEATURE_ICONS = [Users, CalendarClock, CalendarPlus, MessageSquareQuote];

// ══════════════════════════════════════════════════════════════════════
export default function LeasingTracker() {
  const [lang, setLang] = useState<Lang>("es");
  const [langOpen, setLangOpen] = useState(false);
  const t = STRINGS[lang] as T;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PropertyCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
  const [data, setData] = useState<TrackerData | null>(null);
  const [loadingTracker, setLoadingTracker] = useState(false);
  const [cityAgenda, setCityAgenda] = useState<{ cities: CityAgenda[] } | null>(null);

  const skipSearchRef = useRef(false);
  const reqIdRef = useRef(0);
  const blurTimer = useRef<number>();

  const qStr = query.trim();

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (qStr.length < MIN_CHARS) {
      setSuggestions([]);
      setSearching(false);
      setSearched(false);
      setShowLookup(false);
      return;
    }
    setSearching(true);
    setShowLookup(true);
    const myId = ++reqIdRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "leasing-tracker-lookup",
          { body: { query: qStr } },
        );
        if (error) throw error;
        if (myId !== reqIdRef.current) return;
        setSuggestions(Array.isArray(res?.matches) ? res.matches : []);
      } catch (e) {
        console.error("[LeasingTracker] search failed", e);
        if (myId === reqIdRef.current) setSuggestions([]);
      } finally {
        if (myId === reqIdRef.current) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [qStr]);

  // Load the org-wide open showing agenda (grouped by city) once — shown to
  // every visitor on the landing state, before any property search.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke(
          "leasing-tracker-lookup",
          { body: { mode: "open_agenda" } },
        );
        if (error) throw error;
        if (!cancelled)
          setCityAgenda(
            Array.isArray(res?.cities) ? { cities: res.cities } : { cities: [] },
          );
      } catch (e) {
        console.error("[LeasingTracker] open agenda load failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectProperty(card: PropertyCard) {
    skipSearchRef.current = true;
    reqIdRef.current++;
    setQuery(card.address);
    setShowLookup(false);
    setSuggestions([]);
    setSearched(false);
    setLoadingTracker(true);
    setData(null);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "leasing-tracker-lookup",
        { body: { groupKey: card.key } },
      );
      if (error) throw error;
      setData(res?.property ? (res as TrackerData) : null);
    } catch (e) {
      console.error("[LeasingTracker] tracker load failed", e);
      setData(null);
    } finally {
      setLoadingTracker(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (suggestions.length > 0) selectProperty(suggestions[0]);
  }

  function resetSearch() {
    skipSearchRef.current = true;
    reqIdRef.current++;
    setQuery("");
    setData(null);
    setSuggestions([]);
    setSearched(false);
    setShowLookup(false);
    setLoadingTracker(false);
  }

  const lookupOpen =
    showLookup && qStr.length >= MIN_CHARS && (searching || suggestions.length > 0 || searched);

  return (
    <div className="min-h-screen bg-[#f4f1f1] flex flex-col">
      {/* Hero */}
      <header
        className="bg-[#4F46E5] text-white px-4 pt-8 pb-16"
        style={{ fontFamily: "Montserrat, sans-serif" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
                <Building2 className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <span className="font-semibold text-sm text-white/90">{t.brand}</span>
            </div>
            <button
              onClick={() => setLangOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 text-xs font-semibold backdrop-blur"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang.toUpperCase()}
            </button>
          </div>
          <p className="text-[#ffb22c] text-xs font-semibold tracking-[0.2em] uppercase">
            {t.eyebrow}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold leading-tight mt-2">{t.title}</h1>
          <p className="text-white/75 text-sm sm:text-base leading-relaxed mt-3 max-w-2xl">
            {t.subtitle}
          </p>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl w-full mx-auto px-4 -mt-8 pb-16 space-y-6 relative z-10 flex-1">
        {/* Search — z-40 keeps its lookup above the tracker below it */}
        <Card variant="glass" className="relative z-40 shadow-modern-xl overflow-visible">
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => {
                    if (blurTimer.current) window.clearTimeout(blurTimer.current);
                    if (qStr.length >= MIN_CHARS && !data) setShowLookup(true);
                  }}
                  onBlur={() => {
                    blurTimer.current = window.setTimeout(() => setShowLookup(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowLookup(false);
                  }}
                  placeholder={t.placeholder}
                  aria-label={t.title}
                  autoComplete="off"
                  className="pl-11 h-12 text-base bg-white/70 border-white/40"
                  autoFocus
                />

                {lookupOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-white/50 bg-white/95 backdrop-blur-xl shadow-modern-xl overflow-hidden max-h-[360px] overflow-y-auto">
                    {searching && suggestions.length === 0 ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t.searching}
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <SearchX className="h-4 w-4" /> {t.noMatch} “{qStr}”.
                      </div>
                    ) : (
                      <ul role="listbox">
                        {suggestions.map((c) => (
                          <li key={c.key} role="option" aria-selected="false">
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectProperty(c);
                              }}
                              className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-[#4F46E5]/8 transition-colors border-b border-border/40 last:border-0"
                            >
                              <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden shrink-0">
                                {c.photo ? (
                                  <img src={c.photo} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Building2 className="h-4 w-4 text-muted-foreground/50" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{c.address}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {[c.city, c.state].filter(Boolean).join(", ")} {c.zip_code}
                                  {c.units > 1 && (
                                    <span className="text-[#4F46E5] font-medium">
                                      {" · "}
                                      {t.unit(c.units)}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <StatusPill status={c.status} kind="propStatus" t={t} />
                                <span className="text-xs font-semibold">
                                  {rentRange(c.rent_min, c.rent_max, t.locale)}
                                  {t.perMonth}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={loadingTracker}
                className="h-12 px-6 text-base font-semibold bg-[#4F46E5] hover:bg-[#4338CA]"
              >
                {loadingTracker ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Search className="h-5 w-5 mr-2" /> {t.searchBtn}
                  </>
                )}
              </Button>
            </form>

            {data ? (
              <button
                onClick={resetSearch}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t.newSearch}
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground px-1">{t.hint}</p>
            )}
          </CardContent>
        </Card>

        {/* Landing state (no property selected): open agenda by city +
            a friendly explainer of what the tracker shows. */}
        {!data && !loadingTracker && (
          <>
            {cityAgenda && cityAgenda.cities.length > 0 && (
              <Card variant="glass" className="overflow-hidden border-[#4F46E5]/20">
                <div className="bg-gradient-to-r from-[#4F46E5] to-[#6366F1] px-5 sm:px-6 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur shrink-0">
                    <CalendarPlus className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-base sm:text-lg font-semibold text-white">{t.agendaTitle}</p>
                </div>
                <CardContent className="p-5 sm:p-6">
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {t.agendaSubtitle}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {cityAgenda.cities.map((c) => (
                      <div
                        key={c.city}
                        className="flex items-center gap-4 rounded-2xl border border-[#4F46E5]/15 bg-white/70 p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4F46E5] to-[#6366F1] flex items-center justify-center shrink-0 shadow-sm">
                          <CalendarDays className="h-7 w-7 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 text-[#4F46E5] shrink-0" />
                            <span className="truncate">{c.city}</span>
                          </p>
                          <p className="text-xl sm:text-2xl font-bold text-[#4F46E5] first-letter:uppercase leading-tight mt-1">
                            {formatDateLong(c.next_date, t.locale)}
                          </p>
                          {c.dates && c.dates.length > 1 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {c.dates.slice(1, 6).map((d) => (
                                <span
                                  key={d}
                                  className="rounded-md bg-[#4F46E5]/10 px-1.5 py-0.5 text-xs font-semibold text-[#4F46E5] first-letter:uppercase"
                                >
                                  {formatDateShort(d, t.locale)}
                                </span>
                              ))}
                              {c.dates.length > 6 && (
                                <span className="px-1 py-0.5 text-xs font-medium text-muted-foreground">
                                  {t.agendaMoreDates(c.dates.length - 6)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <p className="text-sm font-semibold text-foreground mb-3 px-1">
                {t.whatYouFind}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {t.features.map((f, i) => {
                  const Icon = FEATURE_ICONS[i] || Info;
                  return (
                    <Card key={i} variant="glass">
                      <CardContent className="p-4">
                        <div className="w-9 h-9 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center mb-2.5">
                          <Icon className="h-4 w-4 text-[#4F46E5]" />
                        </div>
                        <p className="text-sm font-semibold mb-1">{f.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {f.desc}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {loadingTracker && <LoadingState />}
        {data && !loadingTracker && <Tracker data={data} t={t} />}
      </main>

      <footer className="py-6 text-center">
        <p className="text-xs text-muted-foreground">{t.poweredBy}</p>
      </footer>

      {/* Language modal */}
      <Dialog open={langOpen} onOpenChange={setLangOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{t.langTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-1">
            {(["es", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLang(l);
                  setLangOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  lang === l
                    ? "border-[#4F46E5] bg-[#4F46E5]/8 text-[#4F46E5]"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span>{l === "es" ? "🇪🇸 Español" : "🇺🇸 English"}</span>
                {lang === l && <CheckCircle2 className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="space-y-4 animate-fade-up">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

// ── Tracker view ──────────────────────────────────────────────────────
function Tracker({ data, t }: { data: TrackerData; t: T }) {
  const { property, summary, funnel, lead_sources, leads_over_time, open_slots } = data;
  const tz = tzForState(property.state);
  const locale = t.locale;

  const sources = lead_sources.map((s) => ({ ...s, label: prettifySource(s.source) }));
  const showingsByStatus = data.showings_by_status.map((s) => ({
    ...s,
    label: t.showStatus[s.status] || prettifySource(s.status),
  }));
  const funnelData = funnel.map((f) => ({ ...f, label: t.stages[f.stage] || f.stage }));
  const overTime = leads_over_time.map((m) => ({ ...m, label: formatMonth(m.month, locale) }));
  const upcoming = data.showings_timeline.filter((s) => s.is_upcoming);
  const history = data.showings_timeline.filter((s) => !s.is_upcoming);
  // Agent notes are keyed by showing id — rendered inline inside the timeline.
  const noteById = new Map(data.agent_comments.map((c) => [c.id, c]));
  const hasLeads = summary.total_leads > 0;
  const act = data.leasing_activity;
  const hasActivity =
    !!act &&
    (act.recent.length > 0 ||
      Object.values(act.last_30d).some((n) => n > 0));
  const bedRange = numRange(property.bedrooms_min, property.bedrooms_max);
  const baRange = numRange(property.bathrooms_min, property.bathrooms_max);

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Property header */}
      <Card variant="glass">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-44 h-40 sm:h-32 rounded-xl bg-muted overflow-hidden shrink-0">
            {property.photo ? (
              <img src={property.photo} alt={property.address} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <StatusPill status={property.status} kind="propStatus" t={t} />
              {property.units > 1 && (
                <Badge variant="outline" className="gap-1.5 font-medium text-[#4F46E5] border-[#4F46E5]/30">
                  <Layers className="h-3 w-3" /> {t.unitsLabel(property.units)}
                </Badge>
              )}
              {property.section_8_accepted && (
                <Badge variant="outline" className="gap-1.5 font-medium text-emerald-700 border-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> {t.section8}
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold leading-tight flex items-start gap-1.5">
              <MapPin className="h-4 w-4 mt-1 text-[#4F46E5] shrink-0" />
              <span>{property.address}</span>
            </h2>
            <p className="text-sm text-muted-foreground ml-6">
              {[property.city, property.state].filter(Boolean).join(", ")} {property.zip_code}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 ml-6 text-sm text-foreground">
              <span className="font-bold text-lg text-[#4F46E5]">
                {rentRange(property.rent_min, property.rent_max, locale)}
                <span className="text-sm font-medium text-muted-foreground">{t.perMonth}</span>
              </span>
              {bedRange && (
                <span className="flex items-center gap-1.5">
                  <BedDouble className="h-4 w-4 text-muted-foreground" />
                  {bedRange} {t.bd}
                </span>
              )}
              {baRange && (
                <span className="flex items-center gap-1.5">
                  <Bath className="h-4 w-4 text-muted-foreground" />
                  {baRange} {t.ba}
                </span>
              )}
              {property.square_feet_total != null && (
                <span className="flex items-center gap-1.5">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  {property.square_feet_total.toLocaleString(locale)} {t.sqft}
                </span>
              )}
            </div>
            {property.units > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3 ml-6">
                {property.unit_statuses.map((u, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/50 px-2 py-1 text-xs"
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[u.status] || "bg-gray-400")} />
                    <span className="font-medium">{u.unit_number || "—"}</span>
                    <span className="text-muted-foreground">
                      {t.propStatus[u.status] || u.status}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Global system pulse — org-wide, real-time proof of movement */}
      {data.global && data.global.total_leads > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white p-5 sm:p-6 shadow-lg shadow-indigo-500/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/80">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </span>
                {t.globalLive}
              </div>
              <p className="mt-1.5 text-3xl sm:text-4xl font-bold tracking-tight">
                {data.global.total_leads.toLocaleString(t.locale)}
              </p>
              <p className="text-sm text-white/85">{t.globalLabel}</p>
            </div>
            {data.global.leads_7d > 0 && (
              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm">
                  <TrendingUp className="h-4 w-4 text-[#FFB22C]" />
                  {t.globalWeek(data.global.leads_7d)}
                </span>
                {data.global.leads_prev_7d > 0 &&
                  data.global.leads_7d > data.global.leads_prev_7d && (
                    <p className="mt-1.5 text-xs text-white/75">
                      {t.globalVsPrev(
                        Math.round(
                          ((data.global.leads_7d - data.global.leads_prev_7d) /
                            data.global.leads_prev_7d) * 100,
                        ),
                      )}
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title={t.totalLeads} value={summary.total_leads} icon={Users} subtitle={t.totalLeadsSub} />
        <StatCard
          title={t.showingsDone}
          value={summary.showings_completed}
          icon={CheckCircle2}
          subtitle={t.showingsDoneSub(summary.showings_total)}
        />
        <StatCard
          title={t.responseSpeed}
          value={
            summary.response_median_minutes != null
              ? `${Math.max(1, Math.round(summary.response_median_minutes))} min`
              : "—"
          }
          icon={Zap}
          subtitle={t.responseSpeedSub}
          subtitle2={
            summary.response_pct_under_1h != null
              ? t.responseSpeedSub2(Math.round(summary.response_pct_under_1h))
              : undefined
          }
        />
        <StatCard
          title={t.recentLeads}
          value={summary.leads_last_30d ?? "—"}
          icon={TrendingUp}
          subtitle={t.recentLeadsSub}
          subtitle2={t.recentLeadsSub2(lastInquiryLabel(summary.last_lead_at, tz, t))}
        />
      </div>

      {/* Leasing activity — hidden entirely when there is none, rather than
          advertising a row of zeros on a property nobody has worked yet. */}
      {hasActivity && <LeasingActivityCard activity={data.leasing_activity!} tz={tz} t={t} />}

      {/* Charts row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={t.pipeline} subtitle={t.pipelineSub}>
          {hasLeads ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 30, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={124} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(79,70,229,0.06)" }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={26}>
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData label={t.noLeads} />
          )}
        </ChartCard>

        <ChartCard title={t.leadsOverTime} subtitle={t.leadsOverTimeSub}>
          {overTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={overTime} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="count" name={t.leadsSeries} stroke="#4F46E5" strokeWidth={2} fill="url(#leadArea)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <NoData label={t.noLeads} />
          )}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={t.sources} subtitle={t.sourcesSub}>
          {sources.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={sources} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2} isAnimationActive={false}>
                  {sources.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <NoData label={t.noSources} />
          )}
        </ChartCard>

        <ChartCard title={t.showingsByStatus} subtitle={t.showingsByStatusSub}>
          {showingsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={showingsByStatus} margin={{ left: -12, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(79,70,229,0.06)" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={38}>
                  {showingsByStatus.map((s, i) => (
                    <Cell key={i} fill={SHOWING_STATUS_COLORS[s.status] || "#818CF8"} />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData label={t.noShowingsBooked} />
          )}
        </ChartCard>
      </div>

      {/* Open availability (agenda slots) */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-[#4F46E5]" /> {t.openAvailability}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {t.openAvailabilitySub(open_slots.upcoming_count, open_slots.past_count)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {open_slots.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">{t.noOpenSlots}</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {open_slots.upcoming.map((s) => {
                  const f = formatSlot(s, locale);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl border border-[#4F46E5]/15 bg-[#4F46E5]/5 px-3 py-2"
                    >
                      <CalendarClock className="h-4 w-4 text-[#4F46E5] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize truncate">{f.date}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.time}
                          {s.duration_minutes ? ` · ${s.duration_minutes} ${t.minutes}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {open_slots.upcoming_count > open_slots.upcoming.length && (
                <p className="text-xs text-muted-foreground mt-3">
                  {t.openSlotsMore(open_slots.upcoming_count - open_slots.upcoming.length)}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Showings timeline + agent notes (merged) */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#4F46E5]" /> {t.timeline}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t.timelineSub}</p>
        </CardHeader>
        <CardContent className="pt-0">
          {data.showings_timeline.length === 0 ? (
            <NoData label={t.noShowings} />
          ) : (
            <div className="space-y-5">
              {upcoming.length > 0 && (
                <TimelineGroup heading={t.upcoming} items={upcoming} tz={tz} t={t} accent notes={noteById} />
              )}
              {history.length > 0 && (
                <TimelineGroup heading={t.history} items={history} tz={tz} t={t} notes={noteById} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground px-1">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>{t.privacy}</p>
      </div>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────
// ── Leasing activity — the owner's proof that the property is being worked ───
// Outcomes (showings, stages) only tell them what landed. This is the effort:
// the calls, follow-ups and messages behind those outcomes. Every row is a
// typed action code from the API — no prospect data reaches this component.
function LeasingActivityCard({
  activity,
  tz,
  t,
}: {
  activity: NonNullable<TrackerData["leasing_activity"]>;
  tz: string;
  t: T;
}) {
  const c = activity.last_30d;
  const tiles = [
    { value: c.contacts, label: t.activityContacts },
    { value: c.messages, label: t.activityMessages },
    { value: c.follow_ups, label: t.activityFollowUps },
    { value: c.showings_confirmed, label: t.activityConfirmed },
  ];

  return (
    <Card variant="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#4F46E5]" />
          {t.activity}
          <span className="text-xs font-normal text-muted-foreground">· {t.activity30d}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t.activitySub}</p>
      </CardHeader>
      <CardContent className="pt-1 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-border/60 bg-white/50 px-3 py-2.5 text-center"
            >
              <p className="text-2xl font-bold text-[#4F46E5] leading-none">{tile.value}</p>
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{tile.label}</p>
            </div>
          ))}
        </div>

        {activity.recent.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{t.activityRecent}</p>
            <ul className="space-y-1.5">
              {activity.recent.map((a) => {
                const style = ACTION_STYLE[a.action];
                const Icon = style?.icon ?? Activity;
                return (
                  <li key={a.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                        style?.tone ?? "text-slate-500 bg-slate-500/10",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {t.actionLabels[a.action] ?? prettifySource(a.action)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {activityAgo(a.created_at, tz, t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

function NoData({ label }: { label: string }) {
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-center">
      <div className="rounded-full bg-muted/60 p-3 mb-2">
        <CalendarClock className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function TimelineGroup({
  heading,
  items,
  tz,
  t,
  accent,
  notes,
}: {
  heading: string;
  items: TrackerData["showings_timeline"];
  tz: string;
  t: T;
  accent?: boolean;
  notes?: Map<string, TrackerData["agent_comments"][number]>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {heading}
      </p>
      <div className="space-y-2">
        {items.map((s) => {
          const note = notes?.get(s.id);
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border p-3",
                accent ? "border-[#4F46E5]/20 bg-[#4F46E5]/5" : "border-border/60 bg-white/40",
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full shrink-0", accent ? "bg-[#4F46E5]" : "bg-muted-foreground/40")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{showingDateTime(s.scheduled_at, tz, t.locale)}</p>
                </div>
                {s.interest_level && t.interestLvl[s.interest_level] && (
                  <Badge variant="outline" className="text-xs">
                    {t.interest(t.interestLvl[s.interest_level])}
                  </Badge>
                )}
                <StatusPill status={s.status} kind="showStatus" t={t} />
              </div>
              {note && (
                <div className="mt-2 ml-5 flex items-start gap-2 rounded-lg border border-border/50 bg-white/60 p-2.5">
                  <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 text-[#4F46E5] shrink-0" />
                  <div className="min-w-0">
                    {note.unit_number && (
                      <Badge variant="outline" className="mb-1 text-xs text-[#4F46E5] border-[#4F46E5]/30">
                        {t.commentUnit(note.unit_number)}
                      </Badge>
                    )}
                    <p className="text-sm leading-relaxed text-foreground/90">{note.comment}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
