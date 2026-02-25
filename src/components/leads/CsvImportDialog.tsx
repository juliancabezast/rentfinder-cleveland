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
  Loader2,
  AlertCircle,
  Check,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  properties: { id: string; address: string }[];
}

// All mappable fields — phone and email are both optional, but at least one is required
const MAPPABLE_FIELDS = [
  { key: "phone", label: "Phone", required: false },
  { key: "email", label: "Email", required: false },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "full_name", label: "Full Name", required: false },
  { key: "budget_min", label: "Budget Min", required: false },
  { key: "budget_max", label: "Budget Max", required: false },
  { key: "move_in_date", label: "Move-in Date", required: false },
  { key: "has_voucher", label: "Has Voucher", required: false },
  { key: "voucher_amount", label: "Voucher Amount", required: false },
  { key: "housing_authority", label: "Housing Authority", required: false },
  { key: "preferred_language", label: "Language", required: false },
  { key: "source", label: "Source", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type MappableFieldKey = typeof MAPPABLE_FIELDS[number]["key"];

// Auto-mapping aliases (header name → field key)
const COLUMN_ALIASES: Record<string, MappableFieldKey> = {
  // Phone
  phone: "phone", "phone number": "phone", phone_number: "phone", telephone: "phone",
  mobile: "phone", cell: "phone", "cell phone": "phone", tel: "phone", "phone no": "phone",
  "phone_no": "phone", "contact phone": "phone", "contact_phone": "phone",
  "primary phone": "phone", "primary_phone": "phone", "mobile phone": "phone",
  "mobile_phone": "phone", "cell_phone": "phone", celular: "phone", telefono: "phone",
  // Email
  email: "email", "email address": "email", email_address: "email", "e-mail": "email",
  "e_mail": "email", mail: "email", correo: "email", "email_id": "email",
  "contact email": "email", "contact_email": "email",
  // First Name
  "first name": "first_name", firstname: "first_name", first_name: "first_name",
  fname: "first_name", "given name": "first_name", given_name: "first_name",
  nombre: "first_name",
  // Last Name
  "last name": "last_name", lastname: "last_name", last_name: "last_name",
  lname: "last_name", surname: "last_name", "family name": "last_name",
  family_name: "last_name", apellido: "last_name",
  // Full Name
  "full name": "full_name", fullname: "full_name", full_name: "full_name",
  name: "full_name", "contact name": "full_name", contact_name: "full_name",
  "client name": "full_name", client_name: "full_name", "customer name": "full_name",
  customer_name: "full_name", "lead name": "full_name", lead_name: "full_name",
  contact: "full_name", "nombre completo": "full_name",
  // Budget
  "budget min": "budget_min", budget_min: "budget_min", "min budget": "budget_min",
  "budget max": "budget_max", budget_max: "budget_max", "max budget": "budget_max",
  budget: "budget_max", rent: "budget_max", "max rent": "budget_max",
  // Move-in Date
  "move in date": "move_in_date", move_in_date: "move_in_date", "move-in date": "move_in_date",
  "move in": "move_in_date", movein: "move_in_date", "move_date": "move_in_date",
  "movein_date": "move_in_date", "desired move in": "move_in_date",
  "desired_move_in": "move_in_date",
  // Voucher
  "has voucher": "has_voucher", has_voucher: "has_voucher", voucher: "has_voucher",
  "voucher amount": "voucher_amount", voucher_amount: "voucher_amount",
  // Housing Authority
  "housing authority": "housing_authority", housing_authority: "housing_authority",
  authority: "housing_authority",
  // Language
  language: "preferred_language", lang: "preferred_language",
  preferred_language: "preferred_language", idioma: "preferred_language",
  // Source
  source: "source", "lead source": "source", lead_source: "source",
  "referral source": "source", referral_source: "source", origin: "source",
  "how heard": "source", how_heard: "source", fuente: "source",
  // Notes
  notes: "notes", note: "notes", comments: "notes", comment: "notes",
  "private notes": "notes", private_notes: "notes", "internal notes": "notes",
  internal_notes: "notes", remarks: "notes", memo: "notes", description: "notes",
  notas: "notes",
};

// Content-based column detection: analyze sample data to guess field type
function detectFieldByContent(
  values: string[],
  alreadyMapped: Set<string>
): MappableFieldKey | null {
  const nonEmpty = values.filter((v) => v && v.trim().length > 0);
  if (nonEmpty.length === 0) return null;

  const threshold = 0.5; // at least 50% of non-empty values must match the pattern

  // Email: contains @
  if (!alreadyMapped.has("email")) {
    const emailCount = nonEmpty.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())).length;
    if (emailCount / nonEmpty.length >= threshold) return "email";
  }

  // Phone: 7-15 digits (may have +, -, spaces, parens)
  if (!alreadyMapped.has("phone")) {
    const phoneCount = nonEmpty.filter((v) => {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }).length;
    if (phoneCount / nonEmpty.length >= threshold) return "phone";
  }

  // Full name: 2+ words, all alphabetic/spaces, not too long
  if (!alreadyMapped.has("full_name")) {
    const nameCount = nonEmpty.filter((v) => {
      const trimmed = v.trim();
      return /^[a-zA-ZÀ-ÿ\s'-]{2,60}$/.test(trimmed) && trimmed.includes(" ");
    }).length;
    if (nameCount / nonEmpty.length >= threshold) return "full_name";
  }

  return null;
}


interface ImportResult {
  imported: number;
  skippedMissingContact: number;
  skippedDuplicate: number;
  issues: Array<{ row: number; reason: string }>;
  propertyName?: string;
}

interface AnalyzedLead {
  rowNum: number;
  name: string;
  phone: string;
  email: string;
  data: Record<string, unknown>;
}

interface PreImportAnalysis {
  newLeads: AnalyzedLead[];
  duplicates: Array<{ rowNum: number; name: string; contact: string; reason: string }>;
  missingContact: Array<{ rowNum: number; name: string }>;
  totalRows: number;
}

// Normalize phone to last 10 digits for dedup matching
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

// Smart initial score — mirrors DB recalculate_lead_scores() formula
function calculateImportScore(lead: Record<string, unknown>, hasPropertyAssigned: boolean): number {
  let score = 30; // base
  if (lead.phone) score += 5;
  if (lead.email) score += 5;
  if (lead.phone && lead.email) score += 3; // complete contact bonus
  if (hasPropertyAssigned) score += 5;
  if (lead.has_voucher === true || (lead.voucher_amount && Number(lead.voucher_amount) > 0)) score += 10;
  // Note: status, showings, calls, and note-keyword bonuses are applied
  // by the DB recalculate_lead_scores() function on rescan, not at import
  return Math.min(score, 100);
}

export const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  properties,
}) => {
  const { userRecord } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard step (1, 2, or 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Property assignment
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);

  // Column mapping: fileColumn -> ourField (or "skip")
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Pre-import analysis
  const [preImportAnalysis, setPreImportAnalysis] = useState<PreImportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewTab, setReviewTab] = useState<"import" | "skipped">("import");

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

      if (data.length === 0) {
        toast.error("File is empty or has no data rows.");
        return;
      }

      setFileHeaders(headers);
      setFileData(data);

      // Auto-map columns: 1) alias match, 2) content-based detection
      const autoMapping: Record<string, string> = {};
      const alreadyMapped = new Set<string>();

      // Pass 1: match by header name aliases
      headers.forEach((header) => {
        const normalizedHeader = header.toLowerCase().trim();
        const mappedField = COLUMN_ALIASES[normalizedHeader];
        if (mappedField) {
          autoMapping[header] = mappedField;
          alreadyMapped.add(mappedField);
        }
      });

      // Pass 2: for unmapped columns, detect by analyzing data content
      const sampleRows = data.slice(0, 10);
      headers.forEach((header) => {
        if (autoMapping[header]) return; // already mapped
        const sampleValues = sampleRows.map((row) => row[header] || "");
        const detected = detectFieldByContent(sampleValues, alreadyMapped);
        if (detected) {
          autoMapping[header] = detected;
          alreadyMapped.add(detected);
        } else {
          autoMapping[header] = "skip";
        }
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

  // At least phone or email must be mapped
  const isPhoneOrEmailMapped = useMemo(() => {
    const mapped = Object.values(columnMapping);
    return mapped.includes("phone") || mapped.includes("email");
  }, [columnMapping]);

  // Preview rows (first 3)
  const previewRows = useMemo(() => {
    return fileData.slice(0, 3);
  }, [fileData]);

  // Build lead objects from file data + column mapping
  const buildLeadsFromFile = () => {
    const validLeads: Array<Record<string, unknown> & { _rowNum: number }> = [];
    const missingContact: Array<{ rowNum: number; name: string }> = [];

    const phoneColumn = Object.entries(columnMapping).find(([_, field]) => field === "phone")?.[0];
    const emailColumn = Object.entries(columnMapping).find(([_, field]) => field === "email")?.[0];
    const nameColumn = Object.entries(columnMapping).find(([_, field]) => field === "full_name")?.[0]
      || Object.entries(columnMapping).find(([_, field]) => field === "first_name")?.[0];

    fileData.forEach((row, index) => {
      const rowNum = index + 2;
      const phoneValue = phoneColumn ? row[phoneColumn]?.trim() : "";
      const emailValue = emailColumn ? row[emailColumn]?.trim() : "";
      const nameValue = nameColumn ? row[nameColumn]?.trim() : "";

      if (!phoneValue && !emailValue) {
        missingContact.push({ rowNum, name: nameValue || "—" });
        return;
      }

      const lead: Record<string, unknown> & { _rowNum: number } = {
        _rowNum: rowNum,
        source: "csv_import",
        status: "new",
      };
      if (phoneValue) lead.phone = phoneValue;
      if (emailValue) lead.email = emailValue;

      Object.entries(columnMapping).forEach(([fileCol, ourField]) => {
        if (ourField === "skip" || ourField === "phone" || ourField === "email") return;
        const value = row[fileCol]?.trim();
        if (!value) return;
        switch (ourField) {
          case "budget_min":
          case "budget_max":
          case "voucher_amount": {
            const numVal = parseFloat(value);
            if (!isNaN(numVal)) lead[ourField] = numVal;
            break;
          }
          case "has_voucher":
            lead[ourField] = ["true", "yes", "1", "y"].includes(value.toLowerCase());
            break;
          case "move_in_date": {
            const dateVal = new Date(value);
            if (!isNaN(dateVal.getTime())) lead[ourField] = dateVal.toISOString().split("T")[0];
            break;
          }
          default:
            lead[ourField] = value;
        }
      });

      validLeads.push(lead);
    });

    return { validLeads, missingContact };
  };

  // Async analysis: validate + dedup against DB before showing Step 3 preview
  const analyzeImport = async () => {
    if (!userRecord?.organization_id) return;
    setAnalyzing(true);
    setReviewTab("import");

    try {
      const { validLeads, missingContact } = buildLeadsFromFile();
      const hasProperty = !!(selectedPropertyId && selectedPropertyId !== "none");

      // Fetch existing phones/emails for dedup
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("phone, email")
        .eq("organization_id", userRecord.organization_id);

      const existingPhones = new Set(
        (existingLeads || []).map((l) => l.phone).filter(Boolean).map((p) => normalizePhone(p))
      );
      const existingEmails = new Set(
        (existingLeads || []).map((l) => l.email).filter(Boolean).map((e) => e.toLowerCase().trim())
      );

      const newLeads: AnalyzedLead[] = [];
      const duplicates: PreImportAnalysis["duplicates"] = [];
      const seenPhones = new Set<string>();
      const seenEmails = new Set<string>();

      validLeads.forEach((lead) => {
        const phone = lead.phone ? normalizePhone(lead.phone as string) : "";
        const email = lead.email ? (lead.email as string).toLowerCase().trim() : "";
        const firstName = (lead.first_name as string) || "";
        const lastName = (lead.last_name as string) || "";
        const fullName = (lead.full_name as string) || [firstName, lastName].filter(Boolean).join(" ");

        // Phone dedup
        if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
          duplicates.push({
            rowNum: lead._rowNum,
            name: fullName || "—",
            contact: (lead.phone as string) || (lead.email as string) || "",
            reason: "Duplicate phone",
          });
          return;
        }
        // Email dedup (only for phone-less leads)
        if (!phone && email && (existingEmails.has(email) || seenEmails.has(email))) {
          duplicates.push({
            rowNum: lead._rowNum,
            name: fullName || "—",
            contact: (lead.email as string) || "",
            reason: "Duplicate email",
          });
          return;
        }

        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);

        // Calculate smart score
        lead.lead_score = calculateImportScore(lead, hasProperty);

        newLeads.push({
          rowNum: lead._rowNum,
          name: fullName || "—",
          phone: (lead.phone as string) || "",
          email: (lead.email as string) || "",
          data: lead,
        });
      });

      setPreImportAnalysis({
        newLeads,
        duplicates,
        missingContact,
        totalRows: fileData.length,
      });
      setStep(3);
    } catch (err) {
      console.error("Analysis error:", err);
      toast.error("Failed to analyze file. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!userRecord?.organization_id || !preImportAnalysis || preImportAnalysis.newLeads.length === 0) return;

    setImporting(true);

    try {
      const { newLeads, duplicates, missingContact } = preImportAnalysis;
      const effectivePropertyId = selectedPropertyId && selectedPropertyId !== "none" ? selectedPropertyId : null;
      const selectedProp = effectivePropertyId ? properties.find((p) => p.id === effectivePropertyId) : null;

      // Build DB-ready lead objects
      const leadNoteTexts: Map<string, string> = new Map();
      const leadsWithOrg = newLeads.map((analyzed) => {
        const lead = analyzed.data;
        const phone = (lead.phone as string) || "";
        const email = (lead.email as string) || "";

        const dedupKey = phone ? normalizePhone(phone) : email.toLowerCase().trim();
        if (lead.notes) leadNoteTexts.set(dedupKey, lead.notes as string);

        // Remove internal/non-DB fields
        const { notes, _rowNum, ...cleanLead } = lead;

        return {
          ...cleanLead,
          organization_id: userRecord.organization_id,
          source: (cleanLead.source as string) || "csv_import",
          stage: "prospect",
          full_name: analyzed.name !== "—" ? analyzed.name : null,
          phone: phone || null,
          ...(email ? { email } : {}),
          ...(effectivePropertyId ? { interested_property_id: effectivePropertyId } : {}),
        };
      });

      // Insert leads
      const { error } = await supabase.from("leads").insert(leadsWithOrg as any);
      if (error) throw error;

      // Create audit notes
      const insertedPhones = leadsWithOrg.map((l) => l.phone).filter(Boolean);
      const insertedEmails = leadsWithOrg.filter((l) => !l.phone).map((l) => l.email).filter(Boolean);

      let insertedLeads: { id: string; phone: string | null; email: string | null }[] = [];
      if (insertedPhones.length > 0) {
        const { data } = await supabase
          .from("leads").select("id, phone, email")
          .eq("organization_id", userRecord.organization_id)
          .in("phone", insertedPhones);
        if (data) insertedLeads.push(...(data as typeof insertedLeads));
      }
      if (insertedEmails.length > 0) {
        const { data } = await supabase
          .from("leads").select("id, phone, email")
          .eq("organization_id", userRecord.organization_id)
          .in("email", insertedEmails);
        if (data) insertedLeads.push(...(data as typeof insertedLeads));
      }

      if (insertedLeads.length > 0) {
        const uploaderName = userRecord.full_name || userRecord.email || "Unknown user";
        const now = new Date().toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
        const propertyNote = selectedProp ? ` — assigned to ${selectedProp.address}` : "";

        const allNotes: Record<string, unknown>[] = [];
        insertedLeads.forEach((lead) => {
          allNotes.push({
            lead_id: lead.id,
            organization_id: userRecord.organization_id,
            created_by: userRecord.id,
            content: `Imported via CSV upload by ${uploaderName} on ${now}${propertyNote}`,
            note_type: "system",
          });
          const dedupKey = lead.phone
            ? normalizePhone(lead.phone)
            : lead.email?.toLowerCase().trim() || "";
          const csvNote = leadNoteTexts.get(dedupKey);
          if (csvNote) {
            allNotes.push({
              lead_id: lead.id,
              organization_id: userRecord.organization_id,
              created_by: userRecord.id,
              content: csvNote,
              note_type: "manual",
            });
          }
        });
        await supabase.from("lead_notes").insert(allNotes as any);
      }

      const issues: Array<{ row: number; reason: string }> = [
        ...missingContact.map((m) => ({ row: m.rowNum, reason: "Missing phone & email" })),
        ...duplicates.map((d) => ({ row: d.rowNum, reason: d.reason })),
      ];

      setImportResult({
        imported: newLeads.length,
        skippedMissingContact: missingContact.length,
        skippedDuplicate: duplicates.length,
        issues,
        propertyName: selectedProp?.address,
      });

      toast.success(`Successfully imported ${newLeads.length} prospects`);
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
        move_in_date: "2026-04-01",
        has_voucher: "false",
        voucher_amount: "",
        housing_authority: "",
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
        move_in_date: "2026-03-15",
        has_voucher: "true",
        voucher_amount: "1200",
        housing_authority: "CMHA",
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
        setPreImportAnalysis(null);
        setSelectedPropertyId("");
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
      setPreImportAnalysis(null);
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
                  Your file must have a header row. Each row needs at least a phone or email.
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

              {/* Property Assignment */}
              {properties.length > 0 && (
                <div className="space-y-2">
                  <Label>Assign to property</Label>
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a property (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No property assignment</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    All imported prospects will be linked to this property.
                  </p>
                </div>
              )}

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
              {/* Contact info warning */}
              {!isPhoneOrEmailMapped && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Phone or Email required.</strong> Map at least one column to
                    "Phone" or "Email" to continue.
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
          {step === 3 && !importResult && preImportAnalysis && (
            <div className="space-y-3">
              {/* Summary stats bar */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg bg-[#f4f1f1] p-2.5 text-center">
                  <p className="text-lg font-bold text-[#374151]">{preImportAnalysis.totalRows}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Rows</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-green-700">{preImportAnalysis.newLeads.length}</p>
                  <p className="text-[10px] text-green-600 uppercase">New</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-700">{preImportAnalysis.duplicates.length}</p>
                  <p className="text-[10px] text-amber-600 uppercase">Duplicates</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-700">{preImportAnalysis.missingContact.length}</p>
                  <p className="text-[10px] text-red-600 uppercase">No Contact</p>
                </div>
              </div>

              {/* Operation details */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-[#370d4b]/10 text-[#370d4b] rounded font-medium">
                  Stage: Prospect
                </span>
                {selectedPropertyId && selectedPropertyId !== "none" && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium">
                    {properties.find((p) => p.id === selectedPropertyId)?.address}
                  </span>
                )}
                {preImportAnalysis.newLeads.length > 0 && (
                  <span className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded font-medium">
                    Score: {preImportAnalysis.newLeads[0].data.lead_score}
                  </span>
                )}
                {Object.entries(columnMapping)
                  .filter(([_, field]) => field !== "skip")
                  .map(([col, field]) => (
                    <span key={col} className="px-2 py-1 bg-[#f4f1f1] text-[#6b7280] rounded">
                      {MAPPABLE_FIELDS.find((f) => f.key === field)?.label || field}
                    </span>
                  ))}
              </div>

              {/* Tab toggle: To Import / Skipped */}
              {(preImportAnalysis.duplicates.length > 0 || preImportAnalysis.missingContact.length > 0) && (
                <div className="flex border-b border-[#e5e7eb]">
                  <button
                    onClick={() => setReviewTab("import")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      reviewTab === "import"
                        ? "border-[#370d4b] text-[#370d4b]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    To Import ({preImportAnalysis.newLeads.length})
                  </button>
                  <button
                    onClick={() => setReviewTab("skipped")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      reviewTab === "skipped"
                        ? "border-amber-600 text-amber-700"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Skipped ({preImportAnalysis.duplicates.length + preImportAnalysis.missingContact.length})
                  </button>
                </div>
              )}

              {/* Preview table: To Import */}
              {reviewTab === "import" && (
                <ScrollArea className="h-[220px] border border-[#e5e7eb] rounded-lg">
                  {preImportAnalysis.newLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p className="text-sm font-medium">No new leads to import</p>
                      <p className="text-xs">All rows are duplicates or missing contact info.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-[#f4f1f1] sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151] w-10">Row</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Phone</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Email</th>
                          <th className="px-2 py-1.5 text-right font-medium text-[#374151] w-14">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preImportAnalysis.newLeads.map((lead) => (
                          <tr key={lead.rowNum} className="border-t border-[#e5e7eb] hover:bg-[#fafafa]">
                            <td className="px-2 py-1.5 text-muted-foreground">{lead.rowNum}</td>
                            <td className="px-2 py-1.5 font-medium truncate max-w-[140px]">{lead.name}</td>
                            <td className="px-2 py-1.5 font-mono truncate max-w-[110px]">
                              {lead.phone || <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5 truncate max-w-[140px]">
                              {lead.email || <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                Number(lead.data.lead_score) >= 60
                                  ? "bg-green-100 text-green-700"
                                  : "bg-[#f4f1f1] text-[#6b7280]"
                              )}>
                                {String(lead.data.lead_score)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ScrollArea>
              )}

              {/* Preview table: Skipped */}
              {reviewTab === "skipped" && (
                <ScrollArea className="h-[220px] border border-[#e5e7eb] rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f4f1f1] sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151] w-10">Row</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Name</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Contact</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preImportAnalysis.duplicates.map((dup) => (
                        <tr key={`dup-${dup.rowNum}`} className="border-t border-[#e5e7eb]">
                          <td className="px-2 py-1.5 text-muted-foreground">{dup.rowNum}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{dup.name}</td>
                          <td className="px-2 py-1.5 font-mono truncate max-w-[120px]">{dup.contact}</td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                              {dup.reason}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {preImportAnalysis.missingContact.map((m) => (
                        <tr key={`miss-${m.rowNum}`} className="border-t border-[#e5e7eb]">
                          <td className="px-2 py-1.5 text-muted-foreground">{m.rowNum}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{m.name}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">—</td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">
                              No phone or email
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Import Result */}
          {step === 3 && importResult && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-6">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-4",
                  importResult.imported > 0 ? "bg-green-100" : "bg-amber-100"
                )}>
                  <Check className={cn(
                    "h-8 w-8",
                    importResult.imported > 0 ? "text-green-600" : "text-amber-600"
                  )} />
                </div>
                <h3 className="text-lg font-semibold text-[#370d4b]">Import Complete!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {importResult.imported > 0
                    ? `Successfully imported ${importResult.imported} prospects`
                    : "No new prospects were imported"}
                </p>
                {importResult.propertyName && (
                  <span className="mt-2 px-2 py-1 bg-[#370d4b]/10 text-[#370d4b] rounded text-xs">
                    Assigned to: {importResult.propertyName}
                  </span>
                )}
              </div>

              {(importResult.skippedDuplicate > 0 || importResult.skippedMissingContact > 0) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                      {importResult.skippedDuplicate > 0 && (
                        <p className="font-medium text-amber-800">
                          {importResult.skippedDuplicate} skipped (duplicate)
                        </p>
                      )}
                      {importResult.skippedMissingContact > 0 && (
                        <p className="font-medium text-amber-800">
                          {importResult.skippedMissingContact} skipped (missing phone & email)
                        </p>
                      )}
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
                onClick={analyzeImport}
                disabled={!isPhoneOrEmailMapped || analyzing}
                className="bg-[#370d4b] hover:bg-[#370d4b]/90"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
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
                disabled={importing || !preImportAnalysis || preImportAnalysis.newLeads.length === 0}
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
                    Import {preImportAnalysis?.newLeads.length || 0} Prospects
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
