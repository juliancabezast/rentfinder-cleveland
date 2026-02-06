import React, { useState, useRef, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// All mappable fields
const MAPPABLE_FIELDS = [
  { key: "phone", label: "Phone", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "full_name", label: "Full Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "budget_min", label: "Budget Min", required: false },
  { key: "budget_max", label: "Budget Max", required: false },
  { key: "move_in_date", label: "Move-in Date", required: false },
  { key: "has_voucher", label: "Has Voucher", required: false },
  { key: "voucher_amount", label: "Voucher Amount", required: false },
  { key: "housing_authority", label: "Housing Authority", required: false },
  { key: "bedrooms_needed", label: "Bedrooms Needed", required: false },
  { key: "preferred_language", label: "Language", required: false },
  { key: "source", label: "Source", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type MappableFieldKey = typeof MAPPABLE_FIELDS[number]["key"];

// Auto-mapping aliases
const COLUMN_ALIASES: Record<string, MappableFieldKey> = {
  phone: "phone",
  "phone number": "phone",
  "phone_number": "phone",
  telephone: "phone",
  mobile: "phone",
  cell: "phone",
  "cell phone": "phone",
  "first name": "first_name",
  firstname: "first_name",
  "first_name": "first_name",
  "last name": "last_name",
  lastname: "last_name",
  "last_name": "last_name",
  "full name": "full_name",
  fullname: "full_name",
  "full_name": "full_name",
  name: "full_name",
  email: "email",
  "email address": "email",
  "email_address": "email",
  "e-mail": "email",
  "budget min": "budget_min",
  "budget_min": "budget_min",
  "min budget": "budget_min",
  "budget max": "budget_max",
  "budget_max": "budget_max",
  "max budget": "budget_max",
  budget: "budget_max",
  "move in date": "move_in_date",
  "move_in_date": "move_in_date",
  "move-in date": "move_in_date",
  "move in": "move_in_date",
  movein: "move_in_date",
  "has voucher": "has_voucher",
  "has_voucher": "has_voucher",
  voucher: "has_voucher",
  "voucher amount": "voucher_amount",
  "voucher_amount": "voucher_amount",
  "housing authority": "housing_authority",
  "housing_authority": "housing_authority",
  authority: "housing_authority",
  "bedrooms needed": "bedrooms_needed",
  "bedrooms_needed": "bedrooms_needed",
  bedrooms: "bedrooms_needed",
  beds: "bedrooms_needed",
  br: "bedrooms_needed",
  language: "preferred_language",
  lang: "preferred_language",
  source: "source",
  "lead source": "source",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
};

interface ValidationIssue {
  row: number;
  field: string;
  issue: string;
  value: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  issues: Array<{ row: number; reason: string }>;
}

export const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard step (1, 2, or 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);

  // Column mapping: fileColumn -> ourField (or "skip")
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Importing state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Parse file based on extension
  const parseFile = async (selectedFile: File): Promise<{ headers: string[]; data: Record<string, string>[] }> => {
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (extension === "xlsx" || extension === "xls") {
      // Parse Excel with SheetJS
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

      if (jsonData.length === 0) {
        return { headers: [], data: [] };
      }

      const headerRow = jsonData[0] as unknown[];
      const headers = headerRow.map((h) => String(h || "").trim());
      const data: Record<string, string>[] = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        const rowObj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          const cellValue = row[idx];
          rowObj[header] = cellValue != null ? String(cellValue).trim() : "";
        });
        data.push(rowObj);
      }

      return { headers, data };
    } else {
      // Parse CSV/TSV with PapaParse
      return new Promise((resolve) => {
        Papa.parse<Record<string, string>>(selectedFile, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const headers = results.meta.fields || [];
            resolve({ headers, data: results.data });
          },
        });
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    try {
      const { headers, data } = await parseFile(selectedFile);
      setFileHeaders(headers);
      setFileData(data);

      // Auto-map columns
      const autoMapping: Record<string, string> = {};
      headers.forEach((header) => {
        const normalizedHeader = header.toLowerCase().trim();
        const mappedField = COLUMN_ALIASES[normalizedHeader];
        autoMapping[header] = mappedField || "skip";
      });
      setColumnMapping(autoMapping);

      // Move to step 2
      setStep(2);
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("Failed to parse file. Please check the format.");
    }
  };

  const updateColumnMapping = (fileColumn: string, ourField: string) => {
    setColumnMapping((prev) => ({ ...prev, [fileColumn]: ourField }));
  };

  // Check if phone is mapped
  const isPhoneMapped = useMemo(() => {
    return Object.values(columnMapping).includes("phone");
  }, [columnMapping]);

  // Preview rows (first 3)
  const previewRows = useMemo(() => {
    return fileData.slice(0, 3);
  }, [fileData]);

  // Validate and prepare leads
  const validateAndPrepareLeads = useMemo(() => {
    if (step !== 3) return { validLeads: [], issues: [], skippedCount: 0 };

    const validLeads: Record<string, unknown>[] = [];
    const issues: Array<{ row: number; reason: string }> = [];
    let skippedCount = 0;

    const phoneColumn = Object.entries(columnMapping).find(([_, field]) => field === "phone")?.[0];

    fileData.forEach((row, index) => {
      const rowNum = index + 2; // +2 for header row and 0-indexing

      // Check phone
      const phoneValue = phoneColumn ? row[phoneColumn]?.trim() : "";
      if (!phoneValue) {
        skippedCount++;
        issues.push({ row: rowNum, reason: "Missing phone number" });
        return;
      }

      // Build lead object
      const lead: Record<string, unknown> = {
        phone: phoneValue,
        source: "csv_import",
        status: "new",
        lead_score: 50,
      };

      // Map other fields
      Object.entries(columnMapping).forEach(([fileCol, ourField]) => {
        if (ourField === "skip" || ourField === "phone") return;

        const value = row[fileCol]?.trim();
        if (!value) return;

        switch (ourField) {
          case "budget_min":
          case "budget_max":
          case "voucher_amount":
          case "bedrooms_needed":
            const numVal = parseFloat(value);
            if (!isNaN(numVal)) {
              lead[ourField] = numVal;
            }
            break;
          case "has_voucher":
            lead[ourField] = ["true", "yes", "1", "y"].includes(value.toLowerCase());
            break;
          case "move_in_date":
            // Try to parse date
            const dateVal = new Date(value);
            if (!isNaN(dateVal.getTime())) {
              lead[ourField] = dateVal.toISOString().split("T")[0];
            }
            break;
          default:
            lead[ourField] = value;
        }
      });

      validLeads.push(lead);
    });

    return { validLeads, issues, skippedCount };
  }, [step, fileData, columnMapping]);

  const handleImport = async () => {
    if (!userRecord?.organization_id) return;

    setImporting(true);

    try {
      const { validLeads, issues, skippedCount } = validateAndPrepareLeads;

      if (validLeads.length === 0) {
        toast.error("No valid leads to import. All rows are missing phone numbers.");
        return;
      }

      // Add organization_id to all leads and cast properly
      const leadsWithOrg = validLeads.map((lead) => ({
        ...lead,
        organization_id: userRecord.organization_id,
        phone: lead.phone as string,
        source: (lead.source as string) || "csv_import",
      }));

      const { error } = await supabase.from("leads").insert(leadsWithOrg as any);

      if (error) throw error;

      setImportResult({
        imported: validLeads.length,
        skipped: skippedCount,
        issues,
      });

      toast.success(`Successfully imported ${validLeads.length} leads`);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import leads. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    // Create workbook with all mappable columns
    const wb = XLSX.utils.book_new();

    const headers = MAPPABLE_FIELDS.map((f) => f.key);
    const sampleData = [
      {
        phone: "+12165551234",
        first_name: "John",
        last_name: "Doe",
        full_name: "",
        email: "john@example.com",
        budget_min: "800",
        budget_max: "1200",
        move_in_date: "2025-03-01",
        has_voucher: "false",
        voucher_amount: "",
        housing_authority: "",
        bedrooms_needed: "2",
        preferred_language: "en",
        source: "referral",
        notes: "Prefers first floor",
      },
      {
        phone: "+12165555678",
        first_name: "Maria",
        last_name: "Garcia",
        full_name: "",
        email: "maria@example.com",
        budget_min: "1000",
        budget_max: "1500",
        move_in_date: "2025-02-15",
        has_voucher: "true",
        voucher_amount: "1200",
        housing_authority: "CMHA",
        bedrooms_needed: "3",
        preferred_language: "es",
        source: "website",
        notes: "Spanish speaking preferred",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });

    // Set column widths
    ws["!cols"] = headers.map(() => ({ wch: 18 }));

    XLSX.utils.book_append_sheet(wb, ws, "Leads Template");

    // Download
    XLSX.writeFile(wb, "leads_import_template.xlsx");
  };

  const handleClose = (isOpen: boolean) => {
    if (!importing) {
      onOpenChange(isOpen);
      if (!isOpen) {
        // Reset state
        setStep(1);
        setFile(null);
        setFileHeaders([]);
        setFileData([]);
        setColumnMapping({});
        setImportResult(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    }
  };

  const handleFinish = () => {
    handleClose(false);
    onSuccess();
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setFile(null);
      setFileHeaders([]);
      setFileData([]);
      setColumnMapping({});
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } else if (step === 3) {
      setStep(2);
    }
  };

  // Stepper UI
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s, idx) => (
        <React.Fragment key={s}>
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
              step >= s
                ? "bg-[#370d4b] text-white"
                : "bg-[#e5e7eb] text-[#6b7280]"
            )}
          >
            {step > s ? <Check className="h-4 w-4" /> : s}
          </div>
          {idx < 2 && (
            <div
              className={cn(
                "w-12 h-0.5 transition-colors",
                step > s ? "bg-[#370d4b]" : "bg-[#e5e7eb]"
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Leads
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Upload a file to bulk import leads into your pipeline."}
            {step === 2 && "Map your file columns to lead fields."}
            {step === 3 && "Review and confirm your import."}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        <div className="flex-1 overflow-hidden">
          {/* Step 1: File Upload */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Supported formats */}
              <div className="rounded-lg bg-[#f4f1f1] p-4 text-sm space-y-3">
                <p className="font-medium text-[#370d4b]">Supported formats:</p>
                <div className="flex flex-wrap gap-2">
                  {[".csv", ".tsv", ".xlsx", ".xls"].map((ext) => (
                    <span
                      key={ext}
                      className="px-2 py-1 bg-white border border-[#e5e7eb] rounded text-xs font-mono"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  Your file must have a header row. Phone number is required for each lead.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-[#370d4b]"
                  onClick={downloadTemplate}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download template (.xlsx)
                </Button>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <Label htmlFor="import-file">Select file</Label>
                <Input
                  ref={fileInputRef}
                  id="import-file"
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Phone warning */}
              {!isPhoneMapped && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Phone is required.</strong> Please map one of your columns to
                    "Phone".
                  </span>
                </div>
              )}

              {/* Mapping table */}
              <ScrollArea className="h-[280px] border border-[#e5e7eb] rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-[#f4f1f1] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[#374151]">
                        Your File Column
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-[#374151]">
                        Maps To
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileHeaders.map((header) => (
                      <tr key={header} className="border-t border-[#e5e7eb]">
                        <td className="px-3 py-2 font-mono text-xs bg-[#fafafa]">
                          {header}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={columnMapping[header] || "skip"}
                            onValueChange={(val) => updateColumnMapping(header, val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">
                                <span className="text-muted-foreground">Skip this column</span>
                              </SelectItem>
                              {MAPPABLE_FIELDS.map((field) => (
                                <SelectItem key={field.key} value={field.key}>
                                  {field.label}
                                  {field.required && (
                                    <span className="text-red-500 ml-1">*</span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>

              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Preview (first 3 rows)
                  </Label>
                  <ScrollArea className="border border-[#e5e7eb] rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-[#f4f1f1]">
                        <tr>
                          {fileHeaders.slice(0, 5).map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium truncate max-w-[120px]">
                              {h}
                            </th>
                          ))}
                          {fileHeaders.length > 5 && (
                            <th className="px-2 py-1.5 text-left text-muted-foreground">
                              +{fileHeaders.length - 5} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="border-t border-[#e5e7eb]">
                            {fileHeaders.slice(0, 5).map((h) => (
                              <td key={h} className="px-2 py-1.5 truncate max-w-[120px]">
                                {row[h] || <span className="text-muted-foreground">-</span>}
                              </td>
                            ))}
                            {fileHeaders.length > 5 && <td className="px-2 py-1.5">...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review & Import */}
          {step === 3 && !importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-[#f4f1f1] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ready to import:</span>
                  <span className="text-lg font-bold text-[#370d4b]">
                    {validateAndPrepareLeads.validLeads.length} leads
                  </span>
                </div>
                {validateAndPrepareLeads.skippedCount > 0 && (
                  <div className="flex items-center justify-between text-sm text-amber-600">
                    <span>Will be skipped (missing phone):</span>
                    <span className="font-medium">{validateAndPrepareLeads.skippedCount}</span>
                  </div>
                )}
              </div>

              {/* Validation issues */}
              {validateAndPrepareLeads.issues.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Issues ({validateAndPrepareLeads.issues.length})
                  </Label>
                  <ScrollArea className="h-[150px] border border-[#e5e7eb] rounded-lg p-2">
                    <div className="space-y-1">
                      {validateAndPrepareLeads.issues.slice(0, 20).map((issue, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs text-amber-600"
                        >
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span>
                            Row {issue.row}: {issue.reason}
                          </span>
                        </div>
                      ))}
                      {validateAndPrepareLeads.issues.length > 20 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          +{validateAndPrepareLeads.issues.length - 20} more issues
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Mapped fields summary */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fields being imported:</Label>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(columnMapping)
                    .filter(([_, field]) => field !== "skip")
                    .map(([col, field]) => (
                      <span
                        key={col}
                        className="px-2 py-0.5 bg-[#370d4b]/10 text-[#370d4b] rounded text-xs"
                      >
                        {MAPPABLE_FIELDS.find((f) => f.key === field)?.label || field}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Import Result */}
          {step === 3 && importResult && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-[#370d4b]">Import Complete!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Successfully imported {importResult.imported} leads
                </p>
              </div>

              {importResult.skipped > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800">
                        {importResult.skipped} rows were skipped
                      </p>
                      <ScrollArea className="max-h-[100px] mt-2">
                        <div className="space-y-1">
                          {importResult.issues.slice(0, 10).map((issue, idx) => (
                            <p key={idx} className="text-amber-700 text-xs">
                              Row {issue.row}: {issue.reason}
                            </p>
                          ))}
                          {importResult.issues.length > 10 && (
                            <p className="text-amber-600 text-xs">
                              +{importResult.issues.length - 10} more
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between gap-2 pt-4 border-t border-[#e5e7eb] mt-4">
          {step === 1 && (
            <>
              <div />
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!isPhoneMapped}
                className="bg-[#370d4b] hover:bg-[#370d4b]/90"
              >
                Continue
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          )}

          {step === 3 && !importResult && (
            <>
              <Button variant="outline" onClick={goBack} disabled={importing}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || validateAndPrepareLeads.validLeads.length === 0}
                className="bg-[#370d4b] hover:bg-[#370d4b]/90"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import {validateAndPrepareLeads.validLeads.length} Leads
                  </>
                )}
              </Button>
            </>
          )}

          {step === 3 && importResult && (
            <>
              <div />
              <Button onClick={handleFinish} className="bg-[#370d4b] hover:bg-[#370d4b]/90">
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
