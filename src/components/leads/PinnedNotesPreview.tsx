import React, { useState, useEffect } from "react";
import { Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PinnedNote {
  id: string;
  content: string;
  created_by: string;
  author_name?: string;
}

interface PinnedNotesPreviewProps {
  leadId: string;
  onSeeAll?: () => void;
}

export const PinnedNotesPreview: React.FC<PinnedNotesPreviewProps> = ({
  leadId,
  onSeeAll,
}) => {
  const [notes, setNotes] = useState<PinnedNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPinnedNotes = async () => {
      try {
        const { data, error } = await supabase
          .from("lead_notes")
          .select("id, content, created_by")
          .eq("lead_id", leadId)
          .eq("is_pinned", true)
          .order("created_at", { ascending: false })
          .limit(3);

        if (error) throw error;

        if (data && data.length > 0) {
          // Fetch author names
          const authorIds = [...new Set(data.map((n) => n.created_by))];
          const { data: usersData } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", authorIds);

          const authorsMap: Record<string, string> = {};
          if (usersData) {
            usersData.forEach((u) => {
              authorsMap[u.id] = u.full_name;
            });
          }

          setNotes(
            data.map((n) => ({
              ...n,
              author_name: authorsMap[n.created_by] || "Unknown",
            }))
          );
        }
      } catch (error) {
        console.error("Error fetching pinned notes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPinnedNotes();
  }, [leadId]);

  if (loading || notes.length === 0) return null;

  return (
    <div className="bg-[#fefce8] border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">Pinned Notes</h3>
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-xs text-amber-700 hover:text-amber-800 hover:underline"
          >
            See all →
          </button>
        )}
      </div>
      <div className="space-y-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="text-sm text-foreground line-clamp-2"
          >
            <span className="font-medium text-amber-800">{note.author_name}:</span>{" "}
            {note.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PinnedNotesPreview;
