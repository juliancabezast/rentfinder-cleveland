// Shared lead de-duplication logic — a single source of truth so the Nurturing
// dashboard widget and the Duplicates tab always agree on the count.
//
// Groups leads via union-find across three strategies: same phone, same email,
// or same name + interested property. Callers MUST pass the FULL lead set
// (paginate past PostgREST's 1000-row cap) — otherwise the result is silently
// undercounted, which is exactly the bug this file was created to fix.

export interface DedupLead {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  interested_property_id: string | null;
  created_at?: string | null;
}

export interface DuplicateGroup<T extends DedupLead = DedupLead> {
  key: string;
  reason: string;
  leads: T[];
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

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export function normalizeName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectDuplicates<T extends DedupLead>(leads: T[]): DuplicateGroup<T>[] {
  const uf = new UnionFind();
  const reasonMap = new Map<string, Set<string>>();

  const addReason = (id1: string, id2: string, reason: string) => {
    uf.union(id1, id2);
    const key = [id1, id2].sort().join("|");
    if (!reasonMap.has(key)) reasonMap.set(key, new Set());
    reasonMap.get(key)!.add(reason);
  };

  // Strategy 1: Phone match
  const phoneMap = new Map<string, T[]>();
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
  const emailMap = new Map<string, T[]>();
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

  // Strategy 3: Name + Property match
  const namePropMap = new Map<string, T[]>();
  for (const lead of leads) {
    const norm = normalizeName(lead.full_name);
    if (norm && norm.length > 2 && lead.interested_property_id) {
      const key = `${norm}::${lead.interested_property_id}`;
      if (!namePropMap.has(key)) namePropMap.set(key, []);
      namePropMap.get(key)!.push(lead);
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
  const groupMap = new Map<string, T[]>();
  for (const lead of leads) {
    if (!uf.parent.has(lead.id)) continue;
    const root = uf.find(lead.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(lead);
  }

  // Collect reasons per group
  const groups: DuplicateGroup<T>[] = [];
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
        (a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      ),
    });
  }

  return groups.sort((a, b) => b.leads.length - a.leads.length);
}

// Fetch ALL non-lost leads for the given org, paginating past the 1000-row cap.
// Returns the minimal columns dedup needs (callers can widen the select).
export async function fetchAllLeadsForDedup<T extends DedupLead>(
  supabase: any,
  organizationId: string,
  columns = "id, full_name, phone, email, interested_property_id, created_at",
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 100000; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select(columns)
      .eq("organization_id", organizationId)
      .neq("status", "lost")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
