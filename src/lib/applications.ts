import { supabase } from "@/integrations/supabase/client";

// The "applicant" milestone — a lightweight, STATUS-NEUTRAL marker the owner
// sets from a completed showing when a prospect actually generates/completes
// their rental application. It replaces the removed Requests Kanban.
//
// Marking stamps leads.applied_at and logs a leasing_activity row with
// action="application_generated" so it surfaces in the Leasing Tracker as
// "aplicación generada". It deliberately does NOT touch leads.status or
// status ("no pasa nada" al lead) — it is purely a dated applicant marker.

interface MarkArgs {
  leadId: string;
  organizationId: string;
  showingId?: string | null;
  propertyId?: string | null;
}

/** Set the applicant tag (idempotent) and log the milestone activity once. */
export async function markApplicationGenerated({
  leadId,
  organizationId,
  showingId = null,
  propertyId = null,
}: MarkArgs): Promise<void> {
  // Only stamp when currently unset — a re-mark must not reset the date, and the
  // milestone activity is logged only when the tag actually flips on.
  const { data: flipped, error } = await supabase
    .from("leads")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("applied_at", null)
    .select("id");
  if (error) throw error;

  if (flipped && flipped.length > 0) {
    const { error: actErr } = await supabase.from("leasing_activity").insert({
      organization_id: organizationId,
      lead_id: leadId,
      showing_id: showingId,
      property_id: propertyId,
      action: "application_generated",
      source: "manual",
    });
    if (actErr) console.error("Failed to log application_generated activity:", actErr);
  }
}

/** Clear the applicant tag and remove the milestone activity for this lead. */
export async function unmarkApplicationGenerated(leadId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ applied_at: null })
    .eq("id", leadId);
  if (error) throw error;

  await supabase
    .from("leasing_activity")
    .delete()
    .eq("lead_id", leadId)
    .eq("action", "application_generated");
}
