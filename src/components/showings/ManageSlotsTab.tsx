import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EnableSlotsDialog, EditSlotData } from "./EnableSlotsDialog";
import {
  CalendarDays,
  Clock,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface DateGroup {
  date: string;
  available: number;
  booked: number;
  slots: { time: string; is_booked: boolean; id: string }[];
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export const ManageSlotsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { toast } = useToast();

  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState<EditSlotData | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  const orgId = userRecord?.organization_id;

  // Fetch upcoming slots grouped by date
  const fetchSlots = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    const today = format(new Date(), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("showing_available_slots")
      .select("id, slot_date, slot_time, is_booked, is_enabled")
      .eq("organization_id", orgId)
      .eq("is_enabled", true)
      .gte("slot_date", today)
      .order("slot_date")
      .order("slot_time");

    if (error) {
      console.error("Error fetching slots:", error);
      toast({ title: "Error", description: "Failed to load slots.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Group by date, deduplicate times (since slots exist per property)
    const groupMap = new Map<string, { times: Map<string, { is_booked: boolean; id: string }> }>();

    (data || []).forEach((s) => {
      if (!groupMap.has(s.slot_date)) {
        groupMap.set(s.slot_date, { times: new Map() });
      }
      const group = groupMap.get(s.slot_date)!;
      const existing = group.times.get(s.slot_time);
      // A time is "booked" if ALL property slots for that time are booked
      // A time is "available" if ANY property slot for that time is available
      if (!existing) {
        group.times.set(s.slot_time, { is_booked: s.is_booked, id: s.id });
      } else if (!s.is_booked) {
        // If any slot for this time is available, mark it as available
        existing.is_booked = false;
      }
    });

    const groups: DateGroup[] = [];
    groupMap.forEach((val, date) => {
      const slots = Array.from(val.times.entries())
        .map(([time, info]) => ({ time, is_booked: info.is_booked, id: info.id }))
        .sort((a, b) => a.time.localeCompare(b.time));

      // Deduplicate times (show each time once regardless of how many properties)
      const seenTimes = new Set<string>();
      const uniqueSlots = slots.filter((s) => {
        if (seenTimes.has(s.time)) return false;
        seenTimes.add(s.time);
        return true;
      });

      groups.push({
        date,
        available: uniqueSlots.filter((s) => !s.is_booked).length,
        booked: uniqueSlots.filter((s) => s.is_booked).length,
        slots: uniqueSlots,
      });
    });

    setDateGroups(groups);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Delete all slots for a given date
  const handleDeleteDate = async (date: string) => {
    if (!orgId) return;
    setDeletingDate(date);

    const { error } = await supabase
      .from("showing_available_slots")
      .delete()
      .eq("organization_id", orgId)
      .eq("slot_date", date)
      .eq("is_booked", false);

    if (error) {
      console.error("Delete error:", error);
      toast({ title: "Error", description: `Failed to delete slots: ${error.message}`, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `Available slots for ${format(parseISO(date), "MMM d")} removed.` });
      fetchSlots();
    }
    setDeletingDate(null);
  };

  // Summary stats
  const totals = useMemo(() => {
    let available = 0;
    let booked = 0;
    dateGroups.forEach((g) => {
      available += g.available;
      booked += g.booked;
    });
    return { available, booked };
  }, [dateGroups]);

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => { setEditData(null); setDialogOpen(true); }}
          className="bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Enable Slots
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = `${window.location.origin}/p/book-showing`;
            navigator.clipboard.writeText(url);
            toast({ title: "Booking link copied!", description: url });
          }}
        >
          <Link2 className="h-4 w-4 mr-1.5" />
          Copy Booking Link
        </Button>

        {/* Stats */}
        <div className="flex gap-2 ml-auto">
          <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
            {totals.available} Available
          </Badge>
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
            {totals.booked} Booked
          </Badge>
        </div>
      </div>

      {/* Slots list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : dateGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No slots enabled yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Enable Slots" to add available times for showings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dateGroups.map((group) => {
            const dateObj = parseISO(group.date);
            return (
              <Card key={group.date} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Date info */}
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-[#370d4b]/10 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-[#370d4b] uppercase leading-none">
                          {format(dateObj, "MMM")}
                        </span>
                        <span className="text-lg font-bold text-[#370d4b] leading-none">
                          {format(dateObj, "d")}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {format(dateObj, "EEEE")}
                        </p>
                        <div className="flex gap-2 mt-0.5">
                          <span className="text-xs text-emerald-700">{group.available} available</span>
                          {group.booked > 0 && (
                            <span className="text-xs text-blue-700">{group.booked} booked</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Edit / Delete buttons */}
                    <div className="flex items-center gap-1">
                      {group.available > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-[#370d4b]"
                          onClick={() => {
                            setEditData({
                              date: group.date,
                              slots: group.slots.map((s) => s.time),
                            });
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {group.available > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingDate === group.date}
                          onClick={() => handleDeleteDate(group.date)}
                        >
                          {deletingDate === group.date ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Time chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {group.slots.map((slot) => (
                      <span
                        key={slot.time}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          slot.is_booked
                            ? "bg-blue-100 text-blue-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {formatTime(slot.time)}
                        {slot.is_booked && " (booked)"}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      {orgId && (
        <EnableSlotsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={fetchSlots}
          orgId={orgId}
          editData={editData}
        />
      )}
    </div>
  );
};
