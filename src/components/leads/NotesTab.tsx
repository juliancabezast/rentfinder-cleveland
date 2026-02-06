import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Pin, PinOff, Trash2, Loader2, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export type NoteType =
  | "general"
  | "call_summary"
  | "showing_note"
  | "objection"
  | "follow_up"
  | "handoff"
  | "escalation";

interface LeadNote {
  id: string;
  content: string;
  note_type: NoteType;
  is_pinned: boolean;
  created_at: string;
  created_by: string;
  author?: { full_name: string } | null;
}

interface NotesTabProps {
  leadId: string;
  onNotesCountChange?: (count: number) => void;
}

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "call_summary", label: "Call Summary" },
  { value: "showing_note", label: "Showing Note" },
  { value: "objection", label: "Objection" },
  { value: "follow_up", label: "Follow-up" },
  { value: "handoff", label: "Handoff" },
  { value: "escalation", label: "Escalation" },
];

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  general: "bg-gray-400",
  call_summary: "bg-blue-500",
  showing_note: "bg-green-500",
  objection: "bg-red-500",
  follow_up: "bg-amber-500",
  handoff: "bg-purple-500",
  escalation: "bg-red-700",
};

export const NotesTab: React.FC<NotesTabProps> = ({ leadId, onNotesCountChange }) => {
  const { userRecord, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Add note form
  const [newContent, setNewContent] = useState("");
  const [newNoteType, setNewNoteType] = useState<NoteType>("general");

  // Delete confirmation
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("id, content, note_type, is_pinned, created_at, created_by")
        .eq("lead_id", leadId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch author names
      const authorIds = [...new Set((data || []).map((n) => n.created_by))];
      let authorsMap: Record<string, string> = {};

      if (authorIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", authorIds);

        if (usersData) {
          usersData.forEach((u) => {
            authorsMap[u.id] = u.full_name;
          });
        }
      }

      const notesWithAuthors = (data || []).map((note) => ({
        ...note,
        note_type: note.note_type as NoteType,
        is_pinned: note.is_pinned ?? false,
        author: { full_name: authorsMap[note.created_by] || "Unknown" },
      }));

      setNotes(notesWithAuthors);
      onNotesCountChange?.(notesWithAuthors.length);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast.error({ title: "Error", description: "Failed to load notes" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [leadId]);

  const handleAddNote = async () => {
    if (!newContent.trim()) return;

    // Use centralized auth - never show organization_id error toast
    if (authLoading) {
      return; // Wait for auth to complete
    }

    if (!userRecord?.organization_id || !userRecord?.id) {
      console.error("Profile not ready:", { userRecord, authLoading });
      // Don't show error toast - the auth context handles profile creation
      return;
    }

    setSubmitting(true);
    try {
      const noteContent = newContent.trim();
      const selectedNoteType = newNoteType;

      const { error: insertError } = await supabase.from("lead_notes").insert({
        organization_id: userRecord.organization_id,
        lead_id: leadId,
        created_by: userRecord.id,
        content: noteContent,
        note_type: selectedNoteType,
      });

      if (insertError) {
        console.error(
          "Note insert error:",
          insertError.message,
          insertError.details,
          insertError.hint,
          insertError.code,
        );
        toast({ title: "Error", description: insertError.message, variant: "destructive" });
        return;
      }

      setNewContent("");
      setNewNoteType("general");
      toast.success({ title: "Note added" });
      await fetchNotes();
    } catch (error) {
      console.error("Error adding note:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add note",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (noteId: string, currentPinned: boolean) => {
    try {
      const { error } = await supabase
        .from("lead_notes")
        .update({ is_pinned: !currentPinned })
        .eq("id", noteId);

      if (error) throw error;

      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, is_pinned: !currentPinned } : n))
      );
      toast.success({ title: currentPinned ? "Note unpinned" : "Note pinned" });
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast.error({ title: "Error", description: "Failed to update note" });
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteNoteId) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from("lead_notes").delete().eq("id", deleteNoteId);

      if (error) throw error;

      setNotes((prev) => prev.filter((n) => n.id !== deleteNoteId));
      onNotesCountChange?.(notes.length - 1);
      toast.success({ title: "Note deleted" });
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error({ title: "Error", description: "Failed to delete note" });
    } finally {
      setDeleting(false);
      setDeleteNoteId(null);
    }
  };

  const pinnedNotes = notes.filter((n) => n.is_pinned);
  const unpinnedNotes = notes.filter((n) => !n.is_pinned);

  if (loading || authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pinned Notes Section */}
      {pinnedNotes.length > 0 && (
        <div className="bg-[#fefce8] border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Pin className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">Pinned Notes</h3>
          </div>
          <div className="space-y-3">
            {pinnedNotes.map((note) => (
              <div
                key={note.id}
                className="bg-white/80 border border-amber-200 rounded-md p-3"
              >
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>
                    {note.author?.full_name} ·{" "}
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                  </span>
                  <button
                    onClick={() => handleTogglePin(note.id, true)}
                    className="p-1 hover:bg-amber-100 rounded transition-colors"
                    title="Unpin"
                  >
                    <PinOff className="h-3.5 w-3.5 text-amber-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Note Section */}
      <div className="bg-white border border-border rounded-lg p-4">
        <Textarea
          placeholder="Add an internal note..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          className="resize-y min-h-[80px] mb-3"
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Note type pills */}
          <div className="flex flex-wrap gap-1.5">
            {NOTE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setNewNoteType(type.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                  newNoteType === type.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Add button */}
          <Button
            onClick={handleAddNote}
            disabled={!newContent.trim() || submitting || !userRecord?.organization_id}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Note
          </Button>
        </div>
      </div>

      {/* Notes Timeline */}
      <div className="bg-white border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">All Notes</h3>
        {unpinnedNotes.length === 0 && pinnedNotes.length === 0 ? (
          <div className="text-center py-8">
            <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">
              No notes yet. Add a note above to get started.
            </p>
          </div>
        ) : unpinnedNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            All notes are pinned above.
          </p>
        ) : (
          <div className="space-y-3">
            {unpinnedNotes.map((note) => (
              <div
                key={note.id}
                className="flex gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Type indicator dot */}
                <div
                  className={cn(
                    "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                    NOTE_TYPE_COLORS[note.note_type]
                  )}
                  title={NOTE_TYPES.find((t) => t.value === note.note_type)?.label}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>
                      {note.author?.full_name} ·{" "}
                      {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTogglePin(note.id, false)}
                        className="p-1 hover:bg-background rounded transition-colors"
                        title="Pin note"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteNoteId(note.id)}
                        className="p-1 hover:bg-destructive/10 rounded transition-colors text-destructive"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNoteId} onOpenChange={() => setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NotesTab;
