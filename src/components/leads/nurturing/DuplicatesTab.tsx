import React, { useState, useEffect } from "react";
import { Copy, Merge, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { MergeDialog, performMerge } from "./MergeDialog";

interface LeadRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  source: string | null;
  /** All tagged property ids from lead_property_interests (may be empty). */
  property_ids: string[];
  created_at: string;
  last_contact_at: string | null;
  property_address?: string | null;
}

interface DuplicateGroup {
  key: string;
  reason: string;
  leads: LeadRow[];
}

interface DuplicatesTabProps {
  refreshKey: number;
  onCountChange: (count: number) => void;
}

// Union-Find for linking overlapping same-name buckets into one group
class UnionFind {
  parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function normalizeName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Detect duplicate groups using CONJUNCTIVE identity: two leads are duplicates
 * only when they share the same normalized name AND the same phone, email or
 * tagged property. The name is part of every grouping key, so different people
 * can never be chained into one group (the old transitive union of loose
 * phone/email matches merged e.g. two distinct people who shared a phone).
 * Contact points used by 2+ distinct names (household phones, shared emails)
 * are ambiguous and excluded as evidence entirely.
 */
function detectDuplicates(leads: LeadRow[]): DuplicateGroup[] {
  // Pass 1: which normalized names use each contact point
  const phoneNames = new Map<string, Set<string>>();
  const emailNames = new Map<string, Set<string>>();
  const nameOf = new Map<string, string>();
  for (const lead of leads) {
    const name = normalizeName(lead.full_name);
    if (!name || name.length <= 2) continue; // unnamed leads never group
    nameOf.set(lead.id, name);
    const phone = normalizePhone(lead.phone);
    if (phone) {
      if (!phoneNames.has(phone)) phoneNames.set(phone, new Set());
      phoneNames.get(phone)!.add(name);
    }
    const email = normalizeEmail(lead.email);
    if (email) {
      if (!emailNames.has(email)) emailNames.set(email, new Set());
      emailNames.get(email)!.add(name);
    }
  }

  // Pass 2: bucket leads under conjunctive keys (name embedded in every key)
  const buckets = new Map<string, { reason: string; leads: LeadRow[] }>();
  const add = (key: string, reason: string, lead: LeadRow) => {
    if (!buckets.has(key)) buckets.set(key, { reason, leads: [] });
    buckets.get(key)!.leads.push(lead);
  };
  for (const lead of leads) {
    const name = nameOf.get(lead.id);
    if (!name) continue;
    const phone = normalizePhone(lead.phone);
    if (phone && phoneNames.get(phone)!.size === 1) {
      add(`p|${name}|${phone}`, "Same name + phone", lead);
    }
    const email = normalizeEmail(lead.email);
    if (email && emailNames.get(email)!.size === 1) {
      add(`e|${name}|${email}`, "Same name + email", lead);
    }
    for (const propertyId of new Set(lead.property_ids || [])) {
      add(`pr|${name}|${propertyId}`, "Same name + property", lead);
    }
  }

  // Union overlapping buckets — safe, since every bucket holds a single name
  const uf = new UnionFind();
  for (const [, bucket] of buckets) {
    if (bucket.leads.length < 2) continue;
    for (let i = 1; i < bucket.leads.length; i++) {
      uf.union(bucket.leads[0].id, bucket.leads[i].id);
    }
  }

  // Build groups and collect reasons per contributing bucket
  const groupMap = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    if (!uf.parent.has(lead.id)) continue;
    const root = uf.find(lead.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(lead);
  }
  const reasonsByRoot = new Map<string, Set<string>>();
  for (const [, bucket] of buckets) {
    if (bucket.leads.length < 2) continue;
    const root = uf.find(bucket.leads[0].id);
    if (!reasonsByRoot.has(root)) reasonsByRoot.set(root, new Set());
    reasonsByRoot.get(root)!.add(bucket.reason);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, groupLeads] of groupMap) {
    if (groupLeads.length < 2) continue;
    groups.push({
      key: root,
      reason: Array.from(reasonsByRoot.get(root) || []).join(", "),
      leads: groupLeads.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    });
  }

  return groups.sort((a, b) => b.leads.length - a.leads.length);
}

// Cap how many groups render at once — with hundreds of duplicates, drawing
// every card would jank the page. detectDuplicates sorts largest-first, so the
// biggest cleanups always show; merge those, refresh, and the rest surface.
const RENDER_LIMIT = 60;

const PAGE = 1000;

/**
 * Fetch every row of a filtered query by firing all 1000-row pages in parallel.
 * Replaces the sequential per-page loop with an embedded join that made the
 * duplicate scan take ~18s on ~18k leads.
 */
async function fetchAllRows(
  table: string,
  columns: string,
  applyFilters: (q: any) => any
): Promise<any[]> {
  const head = await applyFilters(
    (supabase as any).from(table).select(columns, { count: "exact", head: true })
  );
  if (head.error) throw new Error(head.error.message);
  const pages = Math.max(1, Math.ceil((head.count || 0) / PAGE));
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      applyFilters((supabase as any).from(table).select(columns))
        .order("id", { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );
  const rows: any[] = [];
  for (const res of results) {
    if (res.error) throw new Error(res.error.message);
    rows.push(...(res.data || []));
  }
  return rows;
}

export const DuplicatesTab: React.FC<DuplicatesTabProps> = ({ refreshKey, onCountChange }) => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selectedWinners, setSelectedWinners] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<{
    winner: LeadRow;
    loser: LeadRow;
    groupKey: string;
  } | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<{
    group: DuplicateGroup;
    winnerId: string;
  } | null>(null);
  const [mergeProgress, setMergeProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  useEffect(() => {
    fetchAndDetect();
  }, [userRecord?.organization_id, refreshKey]);

  const fetchAndDetect = async () => {
    if (!userRecord?.organization_id) return;
    const orgId = userRecord.organization_id;
    setLoading(true);

    try {
      // Three slim parallel fetches (no per-row joins), then one client-side pass
      const [rawLeads, interests, properties] = await Promise.all([
        fetchAllRows(
          "leads",
          "id, full_name, phone, email, status, source, created_at, last_contact_at",
          (q) => q.eq("organization_id", orgId).neq("status", "lost")
        ),
        fetchAllRows("lead_property_interests", "id, lead_id, property_id", (q) =>
          q.eq("organization_id", orgId)
        ),
        fetchAllRows("properties", "id, address", (q) => q.eq("organization_id", orgId)),
      ]);

      const addressById = new Map<string, string | null>(
        properties.map((p: any) => [p.id, p.address])
      );
      const tagsByLead = new Map<string, string[]>();
      for (const t of interests) {
        if (!tagsByLead.has(t.lead_id)) tagsByLead.set(t.lead_id, []);
        tagsByLead.get(t.lead_id)!.push(t.property_id);
      }

      // Keyed by id — parallel pages can overlap if rows are inserted mid-scan
      const byId = new Map<string, LeadRow>();
      for (const l of rawLeads) {
        const property_ids = tagsByLead.get(l.id) || [];
        byId.set(l.id, {
          ...l,
          property_ids,
          property_address: property_ids.length
            ? addressById.get(property_ids[0]) || null
            : null,
        });
      }

      const detected = detectDuplicates(Array.from(byId.values()));
      setGroups(detected);
      onCountChange(detected.length);

      // Auto-select first lead (oldest) as winner per group
      const winners: Record<string, string> = {};
      for (const g of detected) {
        winners[g.key] = g.leads[0].id;
      }
      setSelectedWinners(winners);
    } catch (err: any) {
      console.error("Failed to scan for duplicates:", err.message);
      toast.error("Duplicate scan failed", { description: err.message });
    }

    setLoading(false);
  };

  const handleMerge = (group: DuplicateGroup) => {
    const winnerId = selectedWinners[group.key];
    const winner = group.leads.find((l) => l.id === winnerId)!;
    if (group.leads.length === 2) {
      const loser = group.leads.find((l) => l.id !== winnerId)!;
      setMergeTarget({ winner, loser, groupKey: group.key });
    } else {
      // 3+ leads: explicit confirmation listing exactly what will merge
      setConfirmGroup({ group, winnerId });
    }
  };

  const handleMergeGroup = async (group: DuplicateGroup, winnerId: string) => {
    const losers = group.leads.filter((l) => l.id !== winnerId);
    const winner = group.leads.find((l) => l.id === winnerId)!;
    let succeeded = 0;
    let failed = 0;
    let firstError: string | null = null;

    setMergeProgress({
      current: 0,
      total: losers.length,
      currentName: winner.full_name || winner.id.slice(0, 8),
    });

    for (let i = 0; i < losers.length; i++) {
      setMergeProgress({
        current: i + 1,
        total: losers.length,
        currentName: losers[i].full_name || losers[i].id.slice(0, 8),
      });
      try {
        await performMerge(winnerId, losers[i].id, userRecord?.id || null, userRecord?.organization_id || null);
        succeeded++;
      } catch (err: any) {
        console.error(`Merge failed for ${losers[i].id}:`, err.message);
        if (!firstError) firstError = err.message;
        failed++;
      }
    }

    setMergeProgress(null);
    if (succeeded === 0 && failed > 0) {
      toast.error(`Merge failed: 0 of ${losers.length} merged`, {
        description: firstError || undefined,
      });
    } else if (failed > 0) {
      toast.warning(`Merged ${succeeded} of ${losers.length} — ${failed} failed`, {
        description: firstError || undefined,
      });
    } else {
      toast.success(
        `Merged ${succeeded} lead${succeeded !== 1 ? "s" : ""} into ${winner.full_name || "primary"}`
      );
    }
    fetchAndDetect();
  };

  const handleMergeComplete = () => {
    setMergeTarget(null);
    fetchAndDetect();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Copy}
        title="No duplicates found"
        description="Your lead database has no duplicate records. Great job keeping it clean!"
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Found {groups.length} group{groups.length !== 1 ? "s" : ""} of potential duplicates
        {groups.length > RENDER_LIMIT
          ? ` — showing the ${RENDER_LIMIT} largest (merge these, then refresh for more)`
          : ""}
        . Review each group, select the primary lead to keep, then confirm its merge.
      </p>

      {mergeProgress && (
        <Card className="border-[#4F46E5]/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" />
              <span className="text-sm font-medium">
                Merging {mergeProgress.current} of {mergeProgress.total}...
              </span>
              <span className="text-sm text-muted-foreground">
                {mergeProgress.currentName}
              </span>
            </div>
            <Progress
              value={(mergeProgress.current / mergeProgress.total) * 100}
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      {groups.slice(0, RENDER_LIMIT).map((group) => (
        <Card key={group.key}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4 text-red-500" />
                {group.leads.length} leads
                <Badge variant="outline" className="text-xs font-normal">
                  {group.reason}
                </Badge>
              </CardTitle>
              <Button size="sm" onClick={() => handleMerge(group)} disabled={!!mergeProgress}>
                <Merge className="h-4 w-4 mr-1.5" />
                {group.leads.length > 2 ? `Merge ${group.leads.length - 1} into Primary` : "Merge"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={selectedWinners[group.key] || ""}
              onValueChange={(val) =>
                setSelectedWinners((prev) => ({ ...prev, [group.key]: val }))
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Primary</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className={
                        selectedWinners[group.key] === lead.id
                          ? "bg-green-50"
                          : ""
                      }
                    >
                      <TableCell>
                        <RadioGroupItem
                          value={lead.id}
                          id={lead.id}
                          aria-label={`Keep ${lead.full_name || "this lead"} as primary`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.full_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.phone || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.property_address || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </RadioGroup>

            {group.leads.length > 2 && (
              <p className="text-xs text-muted-foreground mt-2">
                Select the primary lead to keep, then click Merge — you'll see exactly which
                records will be combined before anything runs.
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {mergeTarget && (
        <MergeDialog
          open={!!mergeTarget}
          onOpenChange={(open) => !open && setMergeTarget(null)}
          winner={mergeTarget.winner}
          loser={mergeTarget.loser}
          onMergeComplete={handleMergeComplete}
        />
      )}

      {/* Per-group confirmation for 3+ lead merges — no blind mass merges */}
      {confirmGroup && (
        <AlertDialog open onOpenChange={(open) => !open && setConfirmGroup(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Confirm group merge
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmGroup.group.leads.length - 1} duplicate
                {confirmGroup.group.leads.length - 1 !== 1 ? "s" : ""} will be merged into the
                primary lead below and then deleted. All their records (notes, showings,
                emails, ...) move to the primary. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y text-sm">
              {confirmGroup.group.leads.map((lead) => {
                const isWinner = lead.id === confirmGroup.winnerId;
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center justify-between gap-2 p-2 ${
                      isWinner ? "bg-green-50" : ""
                    }`}
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-medium">{lead.full_name || "(no name)"}</span>
                      <span className="text-muted-foreground ml-2">
                        {lead.email || lead.phone || "no contact info"}
                      </span>
                    </div>
                    <Badge
                      variant={isWinner ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {isWinner ? "Kept (primary)" : "Merged & deleted"}
                    </Badge>
                  </div>
                );
              })}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const { group, winnerId } = confirmGroup;
                  setConfirmGroup(null);
                  handleMergeGroup(group, winnerId);
                }}
                className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
              >
                Merge {confirmGroup.group.leads.length - 1} into Primary
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};
