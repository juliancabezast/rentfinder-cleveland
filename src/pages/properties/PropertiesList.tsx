import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Building2,
  Filter,
  Globe,
  ClipboardCheck,
  Settings2,
  DoorOpen,
  DollarSign,
  Pencil,
  ImageIcon,
  ImageOff,
  Users,
  Eye,
  EyeOff,
  X,
  ChevronRight,
  ChevronDown,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { ZillowImportDialog } from "@/components/properties/ZillowImportDialog";
import { PropertyRulesDialog } from "@/components/properties/PropertyRulesDialog";
import { CheckPropertiesDialog } from "@/components/properties/CheckPropertiesDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

/** Statuses that are visible on the public sites (marketplace, tracker,
 *  showing scheduler). Everything else — including the manual "Inactive"
 *  switch — is hidden from anonymous visitors. */
const PUBLIC_STATUSES = new Set(["available", "coming_soon"]);

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "coming_soon", label: "Coming Soon" },
  { value: "in_leasing_process", label: "In Leasing" },
  { value: "rented", label: "Rented" },
  { value: "inactive", label: "Inactive" },
];

const FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "public", label: "Public on site" },
  ...STATUS_OPTIONS,
];

/** Shared column template so headers, property rows and unit rows all align. */
// Columns: label (flexes to fill width) | beds baths rent | photos public status
// | Performance group (leads · 7-day Δ · showings · views) | edit. The flexible
// label soaks up slack so the row fills edge-to-edge — the Performance group now
// occupies what used to be an empty right-hand spacer.
const GRID_COLS =
  "grid min-w-[1080px] grid-cols-[minmax(200px,1fr)_56px_56px_112px_56px_48px_140px_56px_52px_60px_96px_36px] items-center gap-x-2 px-3";

/** Short number: 1234 → "1.2k". */
function fmtCompact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Right-hand "Performance" column group: leads · 7-day lead delta · scheduled
 *  showings · views (detail · impressions). Renders 4 grid cells — a fragment
 *  adds no grid item, so the 4 divs become direct children of the row grid. */
function PerfCells({
  leads, delta, showings, viewsDetail, viewsImpr,
}: { leads: number; delta: number; showings: number; viewsDetail: number; viewsImpr: number }) {
  const dash = <span className="text-[11px] text-muted-foreground/40">—</span>;
  return (
    <>
      <div className="flex justify-center">
        {leads > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600">
            <Users className="h-3 w-3" />{fmtCompact(leads)}
          </span>
        ) : dash}
      </div>
      <div className="flex justify-center text-[11px] font-bold tabular-nums">
        {delta > 0 ? (
          <span className="text-emerald-600">▲{delta}</span>
        ) : delta < 0 ? (
          <span className="text-red-500">▼{Math.abs(delta)}</span>
        ) : (
          <span className="text-muted-foreground/40">0</span>
        )}
      </div>
      <div className="flex justify-center">
        {showings > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />{showings}
          </span>
        ) : dash}
      </div>
      <div className="flex justify-center">
        {viewsDetail > 0 || viewsImpr > 0 ? (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-700"
            title={`${viewsDetail} detail views · ${viewsImpr} impressions`}
          >
            <Eye className="h-3.5 w-3.5 text-slate-400" />{fmtCompact(viewsDetail)}
            <span className="px-0.5 text-muted-foreground/40">·</span>
            <span className="font-normal text-muted-foreground">{fmtCompact(viewsImpr)}</span>
          </span>
        ) : dash}
      </div>
    </>
  );
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  available: { label: "Available", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  coming_soon: { label: "Coming Soon", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  in_leasing_process: { label: "In Leasing", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  rented: { label: "Rented", dot: "bg-gray-400", badge: "bg-gray-50 text-gray-500 border-gray-200" },
  inactive: { label: "Inactive", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-500 border-slate-300" },
};

/** Click-to-edit number cell: Enter/blur saves, Esc cancels. */
function InlineNumber({
  value,
  onSave,
  prefix = "",
  suffix = "",
  step = 1,
  widthClass = "w-20",
  canEdit,
  format = (n: number) => n.toLocaleString(),
}: {
  value: number;
  onSave: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  widthClass?: string;
  canEdit: boolean;
  format?: (n: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0 || n === value) return;
    onSave(n);
  };

  if (!canEdit) return <span className="tabular-nums">{prefix}{format(value)}{suffix}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="tabular-nums rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-text"
        title="Click to edit"
      >
        {prefix}{format(value)}{suffix}
      </button>
    );
  }

  return (
    <input
      type="number"
      step={step}
      value={draft}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={cn(
        "rounded-md border border-indigo-300 bg-white px-1.5 py-0.5 text-sm tabular-nums outline-none ring-2 ring-indigo-100",
        widthClass,
      )}
    />
  );
}

/** Colored status pill that is itself the select. */
function StatusSelect({
  status,
  onChange,
  canEdit,
  size = "sm",
}: {
  status: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  size?: "sm" | "xs";
}) {
  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.available;
  if (!canEdit) {
    return <Badge variant="outline" className={cn("px-2 font-medium", sc.badge)}>{sc.label}</Badge>;
  }
  return (
    <Select value={status} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "rounded-full border font-medium shadow-none focus:ring-1 focus:ring-indigo-200",
          size === "sm" ? "h-7 w-[132px] px-2.5 text-xs whitespace-nowrap [&>span]:truncate" : "h-6 w-[110px] px-2 text-[11px] whitespace-nowrap",
          sc.badge,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => {
          const c = STATUS_CONFIG[o.value];
          return (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                {o.label}
                {o.value === "inactive" && <EyeOff className="h-3 w-3 text-slate-400" />}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** Eye/eye-off: is this door visible on the public sites right now? */
function PublicEye({ status }: { status: string }) {
  const isPublic = PUBLIC_STATUSES.has(status);
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">
          {isPublic ? (
            <Eye className="h-4 w-4 text-emerald-500" />
          ) : (
            <EyeOff className="h-4 w-4 text-slate-300" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isPublic
          ? "Live on the public site"
          : status === "inactive"
            ? "Inactive — hidden from all public sites"
            : `Hidden from public (${STATUS_CONFIG[status]?.label || status})`}
      </TooltipContent>
    </Tooltip>
  );
}

const PropertiesList: React.FC = () => {
  const { userRecord } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [zillowOpen, setZillowOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addingUnitTo, setAddingUnitTo] = useState<{ address: string; city: string; state: string; zip_code: string; property_group_id: string | null } | null>(null);
  const [leadCounts, setLeadCounts] = useState<Map<string, number>>(new Map());
  const [showingsCounts, setShowingsCounts] = useState<Map<string, number>>(new Map());
  const [leadsWeek, setLeadsWeek] = useState<Map<string, { cur: number; prev: number }>>(new Map());
  const [live, setLive] = useState(false);
  // Collapsible tree: every property collapsed by default (one compact row),
  // cities expanded. Search/filter auto-expands so matches stay visible.
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());
  // Rows that just changed (own save or a remote realtime event) — flashed green
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flash = useCallback((id: string) => {
    setFlashIds((prev) => new Set(prev).add(id));
    const old = flashTimers.current.get(id);
    if (old) clearTimeout(old);
    flashTimers.current.set(id, setTimeout(() => {
      setFlashIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      flashTimers.current.delete(id);
    }, 1600));
  }, []);

  const fetchData = useCallback(async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("address")
        .order("unit_number");
      if (error) throw error;
      setProperties(data || []);

      // Count interested leads per property. Paginate past PostgREST's 1000-row
      // cap — this org has 3k+ interested leads and a single high-volume
      // property (1k+ leads) would otherwise fill the whole first page, leaving
      // every other property showing "—". Order by the id for stable,
      // non-overlapping pages.
      const counts = new Map<string, number>();
      const LEAD_PAGE = 1000;
      for (let from = 0; from < 500000; from += LEAD_PAGE) {
        const { data: leadData, error: leadError } = await supabase
          .from("leads")
          .select("interested_property_id")
          .eq("organization_id", userRecord.organization_id)
          .not("interested_property_id", "is", null)
          .order("interested_property_id", { ascending: true })
          .range(from, from + LEAD_PAGE - 1);
        if (leadError) break;
        const rows = leadData || [];
        for (const lead of rows) {
          const pid = lead.interested_property_id as string;
          counts.set(pid, (counts.get(pid) || 0) + 1);
        }
        if (rows.length < LEAD_PAGE) break;
      }
      setLeadCounts(counts);

      // Scheduled showings per property (via the purpose-built property_performance view).
      const showings = new Map<string, number>();
      const { data: perf } = await supabase
        .from("property_performance")
        .select("property_id, showings_scheduled")
        .eq("organization_id", userRecord.organization_id)
        .limit(5000);
      for (const r of (perf as any[]) || []) {
        if (r.property_id) showings.set(r.property_id as string, Number(r.showings_scheduled) || 0);
      }
      setShowingsCounts(showings);

      // New-lead delta: rolling last-7-days vs the prior 7 days, per property.
      const DAY = 86400000;
      const curStart = new Date(Date.now() - 7 * DAY).toISOString();
      const prevStart = new Date(Date.now() - 14 * DAY).toISOString();
      const week = new Map<string, { cur: number; prev: number }>();
      for (let from = 0; from < 500000; from += LEAD_PAGE) {
        const { data: recent, error: rErr } = await supabase
          .from("leads")
          .select("interested_property_id, created_at")
          .eq("organization_id", userRecord.organization_id)
          .not("interested_property_id", "is", null)
          .gte("created_at", prevStart)
          .order("interested_property_id", { ascending: true })
          .range(from, from + LEAD_PAGE - 1);
        if (rErr) break;
        const rws = recent || [];
        for (const l of rws) {
          const pid = l.interested_property_id as string;
          const ts = l.created_at as string | null;
          if (!pid || !ts) continue;
          const e = week.get(pid) || { cur: 0, prev: 0 };
          if (ts >= curStart) e.cur += 1; else e.prev += 1;
          week.set(pid, e);
        }
        if (rws.length < LEAD_PAGE) break;
      }
      setLeadsWeek(week);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({ title: "Error", description: "Failed to load properties.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Realtime: any change to this org's properties (from any device/user/
  //    automation) merges straight into the grid, no refresh needed.
  useEffect(() => {
    const orgId = userRecord?.organization_id;
    if (!orgId) return;
    const channel = supabase
      .channel("properties-grid")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "properties", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Property;
            setProperties((prev) => prev.some((p) => p.id === row.id)
              ? prev.map((p) => (p.id === row.id ? row : p))
              : [...prev, row].sort((a, b) =>
                  a.address.localeCompare(b.address) || (a.unit_number || "").localeCompare(b.unit_number || "")));
            flash(row.id);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Property;
            setProperties((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
            flash(row.id);
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Property>;
            if (oldRow.id) setProperties((prev) => prev.filter((p) => p.id !== oldRow.id));
          }
        },
      )
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [userRecord?.organization_id, flash]);

  useEffect(() => () => { flashTimers.current.forEach(clearTimeout); }, []);

  // ── Optimistic inline update: grid changes instantly, reverts on error.
  const updateProperty = async (id: string, patch: Partial<Property>) => {
    const before = properties.find((p) => p.id === id);
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase
      .from("properties")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      if (before) setProperties((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast({ title: "Error", description: "Change could not be saved — reverted.", variant: "destructive" });
    } else {
      flash(id);
    }
  };

  // Filter
  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (statusFilter === "public" && !PUBLIC_STATUSES.has(p.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "public" && p.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.zip_code.includes(searchQuery) ||
        (p.unit_number || "").toLowerCase().includes(q)
      );
    });
  }, [properties, statusFilter, searchQuery]);

  // Group by address — single-unit standalone homes render as one flat row;
  // multi-unit buildings get a slim header row + one row per unit.
  const grouped = useMemo(() => {
    const map = new Map<string, Property[]>();
    for (const p of filtered) {
      const key = `${p.address.trim().toLowerCase()}|${p.city}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([key, units]) => ({
      key,
      address: units[0].address,
      city: units[0].city,
      state: units[0].state,
      zip_code: units[0].zip_code,
      groupId: units[0].property_group_id as string | null,
      units: units.sort((a, b) => (a.unit_number || "").localeCompare(b.unit_number || "")),
    }));
  }, [filtered]);

  // Collapsible city groups (alphabetical). Within each city, buildings are
  // ranked: active multi-unit (2+) → active single-unit → coming soon → rented
  // → inactive, then alphabetical by address inside each rank.
  const cityGroups = useMemo(() => {
    const ACTIVE_STATUSES = new Set(["available", "in_leasing_process"]);
    const buildingRank = (b: (typeof grouped)[number]): number => {
      const statuses = b.units.map((u) => u.status);
      if (statuses.some((s) => ACTIVE_STATUSES.has(s))) return b.units.length >= 2 ? 0 : 1;
      if (statuses.some((s) => s === "coming_soon")) return 2;
      if (statuses.some((s) => s === "rented")) return 3;
      return 4; // inactive / everything else last
    };
    const map = new Map<string, typeof grouped>();
    for (const g of grouped) {
      const key = `${g.city}, ${g.state}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([city, buildings]) => ({
        city,
        buildings: [...buildings].sort(
          (a, b) => buildingRank(a) - buildingRank(b) || a.address.localeCompare(b.address),
        ),
        doors: buildings.reduce((s, b) => s + b.units.length, 0),
        available: buildings.reduce((s, b) => s + b.units.filter((u) => u.status === "available").length, 0),
      }));
  }, [grouped]);

  const forceExpand = searchQuery.trim() !== "" || statusFilter !== "all";
  const toggleBuilding = (key: string) =>
    setExpandedBuildings((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  const toggleCity = (key: string) =>
    setCollapsedCities((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  // Stats
  const stats = useMemo(() => {
    const available = properties.filter((p) => p.status === "available");
    const rented = properties.filter((p) => p.status === "rented");
    const inactive = properties.filter((p) => p.status === "inactive");
    const publicCount = properties.filter((p) => PUBLIC_STATUSES.has(p.status)).length;
    const addresses = new Set(properties.map((p) => p.address.trim().toLowerCase()));
    const potentialRent = available.reduce((sum, p) => sum + (p.rent_price || 0), 0);
    const currentRent = rented.reduce((sum, p) => sum + (p.rent_price || 0), 0);
    return {
      buildings: addresses.size,
      totalDoors: properties.length,
      available: available.length,
      rented: rented.length,
      inactive: inactive.length,
      publicCount,
      potentialRent,
      totalPossible: potentialRent + currentRent,
    };
  }, [properties]);

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingProperty(null);
    setAddingUnitTo(null);
    fetchData();
  };

  const propertyForForm = editingProperty
    ? {
        ...editingProperty,
        photos: Array.isArray(editingProperty.photos) ? (editingProperty.photos as string[]) : null,
        amenities: Array.isArray(editingProperty.amenities) ? (editingProperty.amenities as string[]) : null,
        alternative_property_ids: Array.isArray(editingProperty.alternative_property_ids) ? (editingProperty.alternative_property_ids as string[]) : null,
      }
    : addingUnitTo
    ? {
        id: "",
        address: addingUnitTo.address,
        unit_number: "",
        city: addingUnitTo.city,
        state: addingUnitTo.state,
        zip_code: addingUnitTo.zip_code,
        bedrooms: 0,
        bathrooms: 1,
        rent_price: 0,
        status: "available",
        photos: null,
        amenities: null,
        alternative_property_ids: null,
      }
    : null;

  const canEdit = permissions.canEditProperty;

  const openEditor = (unit: Property) => {
    const gid = unit.property_group_id as string | null;
    navigate(gid ? `/properties/group/${gid}` : `/properties/${unit.id}`);
  };

  /** Expanded unit row — one single-line grid row per door. */
  const renderUnitRow = (unit: Property, opts: { label: string; detail?: string }) => {
    const hasPhotos = Array.isArray(unit.photos) && unit.photos.length > 0;
    const photoCount = hasPhotos ? (unit.photos as unknown[]).length : 0;
    const unitLeads = leadCounts.get(unit.id) || 0;
    const isFlashing = flashIds.has(unit.id);

    return (
      <div
        key={unit.id}
        className={cn(
          GRID_COLS,
          "h-11 transition-colors",
          unit.status === "inactive" && "opacity-60 hover:opacity-100",
          isFlashing ? "bg-emerald-50" : "bg-muted/20 hover:bg-indigo-50/40",
        )}
      >
        {/* Unit label + muted detail on ONE line. `h-auto` opts the link out
            of the global 44px touch-target rule (index.css), which otherwise
            stretches it and breaks vertical centering. */}
        <div className="min-w-0 flex items-baseline gap-2 pl-9">
          <Link
            to={`/properties/${unit.id}`}
            className="h-auto shrink-0 truncate max-w-full text-sm font-semibold leading-5 hover:text-indigo-600"
          >
            {opts.label}
          </Link>
          {opts.detail && (
            <span className="hidden lg:inline truncate text-xs text-muted-foreground">{opts.detail}</span>
          )}
        </div>

        {/* Beds */}
        <div className="text-center text-sm">
          <InlineNumber value={unit.bedrooms} canEdit={canEdit} widthClass="w-12"
            onSave={(v) => updateProperty(unit.id, { bedrooms: v })} />
        </div>
        {/* Baths */}
        <div className="text-center text-sm">
          <InlineNumber value={Number(unit.bathrooms)} step={0.5} canEdit={canEdit} widthClass="w-14"
            format={(n) => (n % 1 === 0 ? String(n) : n.toFixed(1))}
            onSave={(v) => updateProperty(unit.id, { bathrooms: v })} />
        </div>
        {/* Rent */}
        <div className="text-center text-sm font-semibold">
          <InlineNumber value={unit.rent_price} prefix="$" canEdit={canEdit} widthClass="w-20"
            onSave={(v) => updateProperty(unit.id, { rent_price: v })} />
        </div>

        {/* Photos */}
        <div className="flex justify-center">
          {hasPhotos ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              <ImageIcon className="h-3.5 w-3.5" />{photoCount}
            </span>
          ) : (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild><span><ImageOff className="h-3.5 w-3.5 text-red-400" /></span></TooltipTrigger>
              <TooltipContent side="top" className="text-xs">No photos</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Public visibility */}
        <div className="flex justify-center"><PublicEye status={unit.status} /></div>

        {/* Status */}
        <div className="flex justify-center">
          <StatusSelect status={unit.status} canEdit={canEdit}
            onChange={(v) => updateProperty(unit.id, { status: v })} />
        </div>

        {/* Performance group */}
        <PerfCells
          leads={unitLeads}
          delta={(() => { const w = leadsWeek.get(unit.id); return w ? w.cur - w.prev : 0; })()}
          showings={showingsCounts.get(unit.id) || 0}
          viewsDetail={(unit as any).detail_view_count || 0}
          viewsImpr={(unit as any).impression_count || 0}
        />

        {/* Edit */}
        <div className="flex justify-center">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditor(unit)}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    );
  };

  /** Compact property row — SAME design for every property (single-family or
   *  building). Click to expand its units. Single-unit properties edit
   *  directly on the row; multi-unit rows show aggregated ranges. */
  const renderBuildingRow = (group: (typeof grouped)[number], open: boolean) => {
    const units = group.units;
    const single = units.length === 1;
    const u0 = units[0];
    const flashing = units.some((u) => flashIds.has(u.id));
    const allInactive = units.every((u) => u.status === "inactive");
    const leads = units.reduce((s, u) => s + (leadCounts.get(u.id) || 0), 0);
    const unitsWithPhotos = units.filter((u) => Array.isArray(u.photos) && (u.photos as unknown[]).length > 0).length;
    const photoTotal = units.reduce((s, u) => s + (Array.isArray(u.photos) ? (u.photos as unknown[]).length : 0), 0);
    const publicCount = units.filter((u) => PUBLIC_STATUSES.has(u.status)).length;

    return (
      <div
        key={group.key}
        role="button"
        tabIndex={0}
        onClick={() => toggleBuilding(group.key)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBuilding(group.key); } }}
        className={cn(
          GRID_COLS,
          "h-11 cursor-pointer select-none transition-colors",
          allInactive && "opacity-60 hover:opacity-100",
          flashing ? "bg-emerald-50" : "hover:bg-indigo-50/40",
        )}
      >
        {/* Address + muted location on ONE line */}
        <div className="min-w-0 flex items-baseline gap-2">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/50 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 truncate max-w-full text-sm font-semibold leading-5">{group.address}</span>
          <span className="hidden lg:inline truncate text-xs text-muted-foreground">
            {group.city}, {group.state} {group.zip_code}
            {single
              ? u0.square_feet ? ` · ${u0.square_feet} sqft` : ""
              : ` · ${units.length} units`}
          </span>
        </div>

        {/* Beds / Baths / Rent — inline-editable when unambiguous (1 unit) */}
        {single ? (
          <>
            <div className="text-center text-sm" onClick={(e) => e.stopPropagation()}>
              <InlineNumber value={u0.bedrooms} canEdit={canEdit} widthClass="w-12"
                onSave={(v) => updateProperty(u0.id, { bedrooms: v })} />
            </div>
            <div className="text-center text-sm" onClick={(e) => e.stopPropagation()}>
              <InlineNumber value={Number(u0.bathrooms)} step={0.5} canEdit={canEdit} widthClass="w-14"
                format={(n) => (n % 1 === 0 ? String(n) : n.toFixed(1))}
                onSave={(v) => updateProperty(u0.id, { bathrooms: v })} />
            </div>
            <div className="text-center text-sm font-semibold" onClick={(e) => e.stopPropagation()}>
              <InlineNumber value={u0.rent_price} prefix="$" canEdit={canEdit} widthClass="w-20"
                onSave={(v) => updateProperty(u0.id, { rent_price: v })} />
            </div>
          </>
        ) : (
          /* Building totals: sum of beds, baths and rent across all units */
          <>
            <div className="text-center text-sm tabular-nums">
              {units.reduce((s, u) => s + (u.bedrooms || 0), 0)}
            </div>
            <div className="text-center text-sm tabular-nums">
              {(() => { const t = units.reduce((s, u) => s + Number(u.bathrooms || 0), 0); return t % 1 === 0 ? t : t.toFixed(1); })()}
            </div>
            <div className="text-center text-sm font-semibold tabular-nums whitespace-nowrap">
              ${units.reduce((s, u) => s + (u.rent_price || 0), 0).toLocaleString()}
            </div>
          </>
        )}

        {/* Photos (all / some / none) */}
        <div className="flex justify-center">
          {unitsWithPhotos === units.length ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              <ImageIcon className="h-3.5 w-3.5" />{photoTotal}
            </span>
          ) : unitsWithPhotos > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
              <ImageIcon className="h-3.5 w-3.5" />{photoTotal}
            </span>
          ) : (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild><span><ImageOff className="h-3.5 w-3.5 text-red-400" /></span></TooltipTrigger>
              <TooltipContent side="top" className="text-xs">No photos</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Public visibility */}
        <div className="flex justify-center">
          {single ? (
            <PublicEye status={u0.status} />
          ) : (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-0.5">
                  {publicCount > 0 ? (
                    <Eye className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-slate-300" />
                  )}
                  {publicCount > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-600">{publicCount}</span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {publicCount} of {units.length} units on the public site
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Status — editable pill for 1 unit, per-unit dots for buildings */}
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          {single ? (
            <StatusSelect status={u0.status} canEdit={canEdit}
              onChange={(v) => updateProperty(u0.id, { status: v })} />
          ) : (
            <div className="flex items-center gap-1">
              {units.map((u) => {
                const c = STATUS_CONFIG[u.status] || STATUS_CONFIG.available;
                return (
                  <span
                    key={u.id}
                    title={`${u.unit_number ? `Unit ${u.unit_number}` : "Unit"}: ${c.label}`}
                    className={cn("h-2.5 w-2.5 rounded-full", c.dot)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Performance group (summed across units) */}
        <PerfCells
          leads={leads}
          delta={units.reduce((s, u) => { const w = leadsWeek.get(u.id); return s + (w ? w.cur - w.prev : 0); }, 0)}
          showings={units.reduce((s, u) => s + (showingsCounts.get(u.id) || 0), 0)}
          viewsDetail={units.reduce((s, u) => s + ((u as any).detail_view_count || 0), 0)}
          viewsImpr={units.reduce((s, u) => s + ((u as any).impression_count || 0), 0)}
        />

        {/* Edit */}
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => navigate(group.groupId ? `/properties/group/${group.groupId}` : `/properties/${u0.id}`)}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600" />
            Properties
          </h1>
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => setCheckOpen(true)} size="sm" disabled={properties.length === 0}>
            <ClipboardCheck className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Check</span>
          </Button>
          {permissions.canEditProperty && (
            <Button variant="outline" onClick={() => setRulesOpen(true)} size="sm">
              <Settings2 className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Rules</span>
            </Button>
          )}
          {permissions.canCreateProperty && (
            <>
              <Button variant="outline" onClick={() => setZillowOpen(true)} size="sm">
                <Globe className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button onClick={() => { setEditingProperty(null); setFormOpen(true); }} size="sm" className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white">
                <Plus className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Add Property</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats strip — one compact line */}
      <Card className="bg-white/60 backdrop-blur-sm">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4 text-indigo-500" /><b>{stats.buildings}</b><span className="text-muted-foreground">buildings</span></span>
          <span className="inline-flex items-center gap-1.5"><DoorOpen className="h-4 w-4 text-indigo-500" /><b>{stats.totalDoors}</b><span className="text-muted-foreground">doors</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><b className="text-emerald-600">{stats.available}</b><span className="text-muted-foreground">available</span></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /><b>{stats.rented}</b><span className="text-muted-foreground">rented</span></span>
          <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4 text-emerald-500" /><b>{stats.publicCount}</b><span className="text-muted-foreground">on public site</span></span>
          {stats.inactive > 0 && (
            <span className="inline-flex items-center gap-1.5"><EyeOff className="h-4 w-4 text-slate-400" /><b className="text-slate-500">{stats.inactive}</b><span className="text-muted-foreground">inactive</span></span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-emerald-600" /><b className="text-emerald-600">${stats.potentialRent.toLocaleString()}</b><span className="text-muted-foreground">potential/mo</span></span>
          <span className="inline-flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-indigo-500" /><b>${stats.totalPossible.toLocaleString()}</b><span className="text-muted-foreground">if full</span></span>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search address, unit, city, zip..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="flex items-center gap-2">
                  {o.value === "public" ? (
                    <Eye className="h-3.5 w-3.5 text-emerald-500" />
                  ) : STATUS_CONFIG[o.value] ? (
                    <span className={cn("h-2 w-2 rounded-full", STATUS_CONFIG[o.value].dot)} />
                  ) : null}
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="space-y-1.5">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : grouped.length === 0 ? (
        <Card className="bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title="No properties found"
              description={searchQuery || statusFilter !== "all" ? "Try adjusting your filters." : "Add your first property to get started."}
              action={permissions.canCreateProperty && !searchQuery && statusFilter === "all" ? { label: "Add Property", onClick: () => setFormOpen(true) } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-white/80 divide-y divide-border/30">
          {/* Column headers */}
          <div className={cn(GRID_COLS, "hidden md:grid py-2 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-muted-foreground")}>
            <span>Property</span>
            <span className="text-center">Beds</span>
            <span className="text-center">Baths</span>
            <span className="text-center">Rent</span>
            <span className="text-center">Photos</span>
            <span className="text-center">Public</span>
            <span className="text-center">Status</span>
            <span className="text-center">Leads</span>
            <span className="text-center">Δ 7d</span>
            <span className="text-center">Showings</span>
            <span className="text-center">Views</span>
            <span />
          </div>

          {cityGroups.map((cg) => {
            const cityOpen = !collapsedCities.has(cg.city);
            return (
              <React.Fragment key={cg.city}>
                {/* City group header — collapsible */}
                <button
                  type="button"
                  onClick={() => toggleCity(cg.city)}
                  className="w-full h-auto flex items-center gap-2 bg-indigo-50/60 hover:bg-indigo-50 px-3 py-2 text-left transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-indigo-400 transition-transform",
                      !cityOpen && "-rotate-90",
                    )}
                  />
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <span className="truncate text-[13px] font-bold text-indigo-950">{cg.city}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {cg.buildings.length} propert{cg.buildings.length === 1 ? "y" : "ies"} · {cg.doors} door{cg.doors === 1 ? "" : "s"}
                  </span>
                  {cg.available > 0 && (
                    <span className="ml-auto shrink-0 text-xs font-semibold text-emerald-600">
                      {cg.available} available
                    </span>
                  )}
                </button>

                {cityOpen && cg.buildings.map((group) => {
                  const open = forceExpand || expandedBuildings.has(group.key);
                  return (
                    <React.Fragment key={group.key}>
                      {renderBuildingRow(group, open)}
                      {open && group.units.map((unit) =>
                        renderUnitRow(unit, {
                          label: unit.unit_number ? `Unit ${unit.unit_number}` : group.address,
                          detail: unit.square_feet ? `${unit.square_feet} sqft` : undefined,
                        }),
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <PropertyRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
      <ZillowImportDialog open={zillowOpen} onOpenChange={setZillowOpen} onSuccess={fetchData} />
      <CheckPropertiesDialog open={checkOpen} onOpenChange={setCheckOpen} />

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) { setEditingProperty(null); setAddingUnitTo(null); }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty ? "Edit Property" : addingUnitTo ? `Add Unit to ${addingUnitTo.address}` : "Add New Property"}
            </DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={propertyForForm}
            propertyGroupId={addingUnitTo?.property_group_id || undefined}
            propertyGroupAddress={addingUnitTo?.address}
            propertyGroupCity={addingUnitTo?.city}
            propertyGroupState={addingUnitTo?.state}
            propertyGroupZip={addingUnitTo?.zip_code}
            onSuccess={handleFormSuccess}
            onCancel={() => { setFormOpen(false); setEditingProperty(null); setAddingUnitTo(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertiesList;
