import React, { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Search,
  Edit,
  Trash2,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type FaqDocument = Tables<"faq_documents">;

const CATEGORIES = [
  { value: "requirements", label: "Requirements", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "process", label: "Process", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "section_8", label: "Section 8", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "lease_terms", label: "Lease Terms", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { value: "general", label: "General", color: "bg-muted text-muted-foreground" },
];

export const DocumentsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const permissions = usePermissions();

  const [documents, setDocuments] = useState<FaqDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<FaqDocument | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDocuments = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("faq_documents")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("category")
        .order("title");

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [userRecord?.organization_id]);

  const getCategoryBadge = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return (
      <Badge className={`${cat?.color || "bg-muted"} rounded-full text-xs`}>
        {cat?.label || category}
      </Badge>
    );
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === "" ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const openCreateDialog = () => {
    setEditingDoc(null);
    setFormTitle("");
    setFormCategory("");
    setFormContent("");
    setFormIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (doc: FaqDocument) => {
    setEditingDoc(doc);
    setFormTitle(doc.title);
    setFormCategory(doc.category);
    setFormContent(doc.content);
    setFormIsActive(doc.is_active ?? true);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!userRecord?.organization_id) return;

    if (!formTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formCategory) {
      toast.error("Category is required");
      return;
    }
    if (!formContent.trim()) {
      toast.error("Content is required");
      return;
    }

    setSubmitting(true);
    try {
      if (editingDoc) {
        const { error } = await supabase
          .from("faq_documents")
          .update({
            title: formTitle.trim(),
            category: formCategory,
            content: formContent.trim(),
            is_active: formIsActive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingDoc.id);

        if (error) throw error;
        toast.success("Document updated");
      } else {
        const { error } = await supabase.from("faq_documents").insert({
          organization_id: userRecord.organization_id,
          title: formTitle.trim(),
          category: formCategory,
          content: formContent.trim(),
          is_active: formIsActive,
        });

        if (error) throw error;
        toast.success("Document created");
      }

      setDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Failed to save document");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingDocId) return;

    try {
      const { error } = await supabase
        .from("faq_documents")
        .delete()
        .eq("id", deletingDocId);

      if (error) throw error;
      toast.success("Document deleted");
      setDeleteDialogOpen(false);
      setDeletingDocId(null);
      fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const confirmDelete = (docId: string) => {
    setDeletingDocId(docId);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground">
            Knowledge base used by AI agents to answer prospect questions
          </p>
        </div>
        {permissions.canCreateEditDocuments && (
          <Button
            onClick={openCreateDialog}
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <Card variant="glass">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="glass">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card variant="glass">
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No FAQ documents yet"
              description={
                searchQuery || categoryFilter !== "all"
                  ? "No documents match your search criteria."
                  : "Add documents to help AI agents answer prospect questions accurately."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredDocuments.map((doc) => (
            <Card
              key={doc.id}
              variant="glass"
              className={`hover:shadow-modern-lg transition-all duration-300 ${
                !doc.is_active ? "opacity-60" : ""
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(doc.category)}
                    {!doc.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        <PowerOff className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {permissions.canCreateEditDocuments && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(doc)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {permissions.canDeleteDocuments && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => confirmDelete(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <h3 className="font-semibold mt-3">{doc.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                  {doc.content.length > 150
                    ? doc.content.substring(0, 150) + "..."
                    : doc.content}
                </p>

                <p className="text-xs text-muted-foreground mt-4">
                  Updated{" "}
                  {doc.updated_at
                    ? format(new Date(doc.updated_at), "MMM d, yyyy")
                    : doc.created_at
                    ? format(new Date(doc.created_at), "MMM d, yyyy")
                    : "Unknown"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingDoc ? "Edit Document" : "Add Document"}
            </DialogTitle>
            <DialogDescription>
              {editingDoc
                ? "Update the FAQ document content"
                : "Create a new FAQ document for AI agents to use"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Section 8 Voucher Requirements"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Enter the full FAQ content that AI agents will use to answer questions..."
                rows={6}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive documents won't be used by AI agents
                </p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {submitting
                ? "Saving..."
                : editingDoc
                ? "Update Document"
                : "Create Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? AI agents will no
              longer have access to this information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
