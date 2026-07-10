import React, { useState, useEffect } from "react";
import { Copy, Merge, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
  lead_score: number | null;
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

// Union-Find for merging groups across strategies
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

function detectDuplicates(leads: LeadRow[]): DuplicateGroup[] {
  const uf = new UnionFind();
  const reasonMap = new Map<string, Set<string>>();

  const addReason = (id1: string, id2: string, reason: string) => {
    uf.union(id1, id2);
    const key = [id1, id2].sort().join("|");
    if (!reasonMap.has(key)) reasonMap.set(key, new Set());
    reasonMap.get(key)!.add(reason);
  };

  // Strategy 1: Phone match
  const phoneMap = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const norm = normalizePhone(lead.phone);
    if (norm) {
      if (!phoneMap.has(norm)) phoneMap.set(norm, []);
      phoneMap.get(norm)!.push(lead);
    }
  }
  for (const [, group] of phoneMap) {
    if (group.length > 1) {
      for (let i = 1; i < group.length; i++) {
        addReason(group[0].id, group[i].id, "Same phone");
      }
    }
  }

  // Strategy 2: Email match
  const emailMap = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const norm = normalizeEmail(lead.email);
    if (norm) {
      if (!emailMap.has(norm)) emailMap.set(norm, []);
      emailMap.get(norm)!.push(lead);
    }
  }
  for (const [, group] of emailMap) {
    if (group.length > 1) {
      for (let i = 1; i < group.length; i++) {
        addReason(group[0].id, group[i].id, "Same email");
      }
    }
  }

  // Strategy 3: Name + Property match — one dup-key per tagged property, so
  // ANY shared tagged property groups two same-name leads. Leads with zero
  // tags are skipped (name alone is too weak a signal).
  const namePropMap = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    const norm = normalizeName(lead.full_name);
    if (norm && norm.length > 2 && lead.property_ids?.length) {
      for (const propertyId of lead.property_ids) {
        const key = `${norm}::${propertyId}`;
        if (!namePropMap.has(key)) namePropMap.set(key, []);
        namePropMap.get(key)!.push(lead);
      }
    }
  }
  for (const [, group] of namePropMap) {
    if (group.length > 1) {
      for (let i = 1; i < group.length; i++) {
        addReason(group[0].id, group[i].id, "Same name + property");
      }
    }
  }

  // Build groups from union-find
  const groupMap = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    if (!uf.parent.has(lead.id)) continue;
    const root = uf.find(lead.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(lead);
  }

  // Collect reasons per group
  const groups: DuplicateGroup[] = [];
  for (const [root, groupLeads] of groupMap) {
    if (groupLeads.length < 2) continue;

    const reasons = new Set<string>();
    for (let i = 0; i < groupLeads.length; i++) {
      for (let j = i + 1; j < groupLeads.length; j++) {
        const key = [groupLeads[i].id, groupLeads[j].id].sort().join("|");
        const r = reasonMap.get(key);
        if (r) r.forEach((reason) => reasons.add(reason));
      }
    }

    groups.push({
      key: root,
      reason: Array.from(reasons).join(", "),
      leads: groupLeads.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    });
  }

  return groups.sort((a, b) => b.leads.length - a.leads.length);
}

// Cap how many groups render at once — with hundreds of duplicates, drawing
// every card would jank the page. detectDuplicates sorts largest-first, so the
// biggest cleanups always show; "Merge All" still acts on every group.
const RENDER_LIMIT = 60;

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
  const [mergeAllProgress, setMergeAllProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  useEffect(() => {
    fetchAndDetect();
  }, [userRecord?.organization_id, refreshKey]);

  const fetchAndDetect = async () => {
    if (!userRecord?.organization_id) return;
    setLoading(true);

    // Fetch ALL non-lost leads, paginating past PostgREST's 1000-row cap —
    // otherwise dedup only sees the first 1000 leads and massively undercounts.
    const SELECT_COLS =
      "id, full_name, phone, email, status, lead_score, source, created_at, last_contact_at, lead_property_interests(property_id, properties(address))";
    const raw: any[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase
        .from("leads")
        .select(SELECT_COLS)
        .eq("organization_id", userRecord.organization_id)
        .neq("status", "lost")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("Failed to fetch leads for dedup:", error.message);
        setLoading(false);
        return;
      }
      raw.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const leads: LeadRow[] = raw.map((l: any) => ({
      ...l,
      property_ids: (l.lead_property_interests || []).map((t: any) => t.property_id),
      property_address: l.lead_property_interests?.[0]?.properties?.address || null,
    }));

    const detected = detectDuplicates(leads);
    setGroups(detected);
    onCountChange(detected.length);

    // Auto-select first lead (oldest) as winner per group
    const winners: Record<string, string> = {};
    for (const g of detected) {
      winners[g.key] = g.leads[0].id;
    }
    setSelectedWinners(winners);

    setLoading(false);
  };

  const handleMerge = (group: DuplicateGroup) => {
    const winnerId = selectedWinners[group.key];
    const winner = group.leads.find((l) => l.id === winnerId)!;
    if (group.leads.length === 2) {
      const loser = group.leads.find((l) => l.id !== winnerId)!;
      setMergeTarget({ winner, loser, groupKey: group.key });
    } else {
      // 3+ leads: merge all non-primary into primary sequentially
      handleMergeGroup(group, winnerId);
    }
  };

  const handleMergeGroup = async (group: DuplicateGroup, winnerId: string) => {
    const losers = group.leads.filter((l) => l.id !== winnerId);
    const winner = group.leads.find((l) => l.id === winnerId)!;
    let succeeded = 0;
    let failed = 0;

    setMergeAllProgress({
      current: 0,
      total: losers.length,
      currentName: winner.full_name || winner.id.slice(0, 8),
    });

    for (let i = 0; i < losers.length; i++) {
      setMergeAllProgress({
        current: i + 1,
        total: losers.length,
        currentName: losers[i].full_name || losers[i].id.slice(0, 8),
      });
      try {
        await performMerge(winnerId, losers[i].id, userRecord?.id || null);
        succeeded++;
      } catch (err: any) {
        console.error(`Merge failed for ${losers[i].id}:`, err.message);
        failed++;
      }
    }

    setMergeAllProgress(null);
    toast.success(`Merged ${succeeded} lead${succeeded !== 1 ? "s" : ""} into ${winner.full_name || "primary"}${failed > 0 ? ` (${failed} failed)` : ""}`);
    fetchAndDetect();
  };

  const handleMergeComplete = () => {
    setMergeTarget(null);
    fetchAndDetect();
  };

  const handleMergeAll = async () => {
    if (groups.length === 0) return;

    // Count total merge operations (each non-primary lead is one merge)
    const totalOps = groups.reduce((sum, g) => sum + (g.leads.length - 1), 0);
    setMergeAllProgress({ current: 0, total: totalOps, currentName: "" });
    let succeeded = 0;
    let failed = 0;
    let opIndex = 0;

    for (const group of groups) {
      const winnerId = selectedWinners[group.key] || group.leads[0].id;
      const losers = group.leads.filter((l) => l.id !== winnerId);

      for (const loser of losers) {
        opIndex++;
        setMergeAllProgress({
          current: opIndex,
          total: totalOps,
          currentName: loser.full_name || loser.id.slice(0, 8),
        });

        try {
          await performMerge(winnerId, loser.id, userRecord?.id || null);
          succeeded++;
        } catch (err: any) {
          console.error(`Merge failed for group ${group.key}:`, err.message);
          failed++;
        }
      }
    }

    setMergeAllProgress(null);
    toast.success(`Merge complete: ${succeeded} merged${failed > 0 ? `, ${failed} failed` : ""}`);
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

  const mergeableCount = groups.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Found {groups.length} group{groups.length !== 1 ? "s" : ""} of potential duplicates
          {groups.length > RENDER_LIMIT
            ? ` — showing the ${RENDER_LIMIT} largest (merge these, then refresh for more)`
            : ""}
          . Select the primary lead in each group, then click Merge.
        </p>
        {mergeableCount > 1 && !mergeAllProgress && (
          <Button
            onClick={handleMergeAll}
            className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
          >
            <Merge className="h-4 w-4 mr-1.5" />
            Merge All ({mergeableCount})
          </Button>
        )}
      </div>

      {mergeAllProgress && (
        <Card className="border-[#4F46E5]/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" />
              <span className="text-sm font-medium">
                Merging {mergeAllProgress.current} of {mergeAllProgress.total}...
              </span>
              <span className="text-sm text-muted-foreground">
                {mergeAllProgress.currentName}
              </span>
            </div>
            <Progress
              value={(mergeAllProgress.current / mergeAllProgress.total) * 100}
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
              <Button size="sm" onClick={() => handleMerge(group)}>
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
                    <TableHead>Score</TableHead>
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
                        <RadioGroupItem value={lead.id} id={lead.id} />
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
                        <Badge
                          variant="outline"
                          className={
                            (lead.lead_score || 0) >= 80
                              ? "border-green-500 text-green-700"
                              : (lead.lead_score || 0) >= 50
                              ? "border-amber-500 text-amber-700"
                              : ""
                          }
                        >
                          {lead.lead_score ?? "—"}
                        </Badge>
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
                Select the primary lead to keep, then click Merge to combine all others into it.
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
    </div>
  );
};
