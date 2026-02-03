import React, { useState, useRef } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CsvRow {
  full_name?: string;
  phone?: string;
  email?: string;
  source?: string;
  budget_min?: string;
  budget_max?: string;
  move_in_date?: string;
  has_voucher?: string;
}

export const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<CsvRow[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // Parse for preview
      Papa.parse<CsvRow>(selectedFile, {
        header: true,
        preview: 5,
        complete: (results) => {
          setPreview(results.data);
        },
      });
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "full_name",
      "phone",
      "email",
      "source",
      "budget_min",
      "budget_max",
      "move_in_date",
      "has_voucher",
    ];
    const sampleData = [
      "John Doe,+12165551234,john@example.com,referral,800,1200,2025-03-01,false",
      "Jane Smith,+12165555678,jane@example.com,website,1000,1500,2025-02-15,true",
    ];
    
    const csvContent = [headers.join(","), ...sampleData].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file || !userRecord?.organization_id) return;

    setImporting(true);
    
    try {
      const results = await new Promise<Papa.ParseResult<CsvRow>>((resolve) => {
        Papa.parse<CsvRow>(file, {
          header: true,
          complete: resolve,
        });
      });

      const leadsToInsert: Array<{
        organization_id: string;
        full_name: string | null;
        phone: string;
        email: string | null;
        source: string;
        status: string;
        lead_score: number;
        budget_min: number | null;
        budget_max: number | null;
        move_in_date: string | null;
        has_voucher: boolean;
      }> = [];
      let skippedCount = 0;

      for (const row of results.data) {
        const phone = row.phone?.trim();
        
        if (!phone) {
          skippedCount++;
          continue;
        }

        leadsToInsert.push({
          organization_id: userRecord.organization_id,
          full_name: row.full_name?.trim() || null,
          phone: phone,
          email: row.email?.trim() || null,
          source: "csv_import",
          status: "new",
          lead_score: 50,
          budget_min: row.budget_min ? parseFloat(row.budget_min) : null,
          budget_max: row.budget_max ? parseFloat(row.budget_max) : null,
          move_in_date: row.move_in_date?.trim() || null,
          has_voucher: row.has_voucher?.toLowerCase() === "true",
        });
      }

      if (leadsToInsert.length === 0) {
        toast({
          title: "No valid leads",
          description: "All rows were skipped due to missing phone numbers.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("leads").insert(leadsToInsert);

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `${leadsToInsert.length} leads imported successfully${
          skippedCount > 0 ? `, ${skippedCount} rows skipped (missing phone)` : ""
        }`,
      });

      onOpenChange(false);
      setFile(null);
      setPreview([]);
      onSuccess();
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: "There was an error importing leads. Please try again.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!importing) {
      onOpenChange(open);
      if (!open) {
        setFile(null);
        setPreview([]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Leads from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import leads into your pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Required columns:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><code className="text-xs bg-muted px-1 py-0.5 rounded">phone</code> (required)</li>
              <li><code className="text-xs bg-muted px-1 py-0.5 rounded">full_name</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">email</code> (optional)</li>
              <li><code className="text-xs bg-muted px-1 py-0.5 rounded">budget_min</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">budget_max</code> (optional)</li>
              <li><code className="text-xs bg-muted px-1 py-0.5 rounded">move_in_date</code> (YYYY-MM-DD format)</li>
              <li><code className="text-xs bg-muted px-1 py-0.5 rounded">has_voucher</code> (true/false)</li>
            </ul>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto"
              onClick={downloadTemplate}
            >
              <Download className="h-3 w-3 mr-1" />
              Download template
            </Button>
          </div>

          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV file</Label>
            <Input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={importing}
            />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Preview (first 5 rows)
              </Label>
              <div className="rounded border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Phone</th>
                      <th className="px-2 py-1 text-left">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{row.full_name || "-"}</td>
                        <td className="px-2 py-1">
                          {row.phone ? (
                            row.phone
                          ) : (
                            <span className="text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1">{row.email || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Leads
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
