import React, { useState, useRef } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  Download,
  Loader2,
  AlertCircle,
  Check,
  Mail,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { showingInvitationTemplate } from "@/lib/emailTemplates";
import {
  UNSUBSCRIBE_URL_PLACEHOLDER,
  DEFAULT_MARKETING_POSTAL_ADDRESS,
} from "@/lib/emailTemplateDefaults";
import { upsertLeadTags } from "@/lib/leadTags";

export interface PropertyInfo {
  id: string;
  address: string;
  city?: string;
  bedrooms?: number;
  bathrooms?: number;
  rent_price?: number;
  unit_number?: string | null;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  properties: PropertyInfo[];
}

// All mappable fields
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

// Auto-mapping aliases
const COLUMN_ALIASES: Record<string, MappableFieldKey> = {
  phone: "phone", "phone number": "phone", phone_number: "phone", telephone: "phone",
  mobile: "phone", cell: "phone", "cell phone": "phone", tel: "phone", "phone no": "phone",
  "phone_no": "phone", "contact phone": "phone", "contact_phone": "phone",
  "primary phone": "phone", "primary_phone": "phone", "mobile phone": "phone",
  "mobile_phone": "phone", "cell_phone": "phone", celular: "phone", telefono: "phone",
  email: "email", "email address": "email", email_address: "email", "e-mail": "email",
  "e_mail": "email", mail: "email", correo: "email", "email_id": "email",
  "contact email": "email", "contact_email": "email",
  "first name": "first_name", firstname: "first_name", first_name: "first_name",
  fname: "first_name", "given name": "first_name", given_name: "first_name",
  nombre: "first_name",
  "last name": "last_name", lastname: "last_name", last_name: "last_name",
  lname: "last_name", surname: "last_name", "family name": "last_name",
  family_name: "last_name", apellido: "last_name",
  "full name": "full_name", fullname: "full_name", full_name: "full_name",
  name: "full_name", "contact name": "full_name", contact_name: "full_name",
  "client name": "full_name", client_name: "full_name", "customer name": "full_name",
  customer_name: "full_name", "lead name": "full_name", lead_name: "full_name",
  contact: "full_name", "nombre completo": "full_name",
  "budget min": "budget_min", budget_min: "budget_min", "min budget": "budget_min",
  "budget max": "budget_max", budget_max: "budget_max", "max budget": "budget_max",
  budget: "budget_max", rent: "budget_max", "max rent": "budget_max",
  "move in date": "move_in_date", move_in_date: "move_in_date", "move-in date": "move_in_date",
  "move in": "move_in_date", movein: "move_in_date", "move_date": "move_in_date",
  "movein_date": "move_in_date", "desired move in": "move_in_date",
  "desired_move_in": "move_in_date",
  "has voucher": "has_voucher", has_voucher: "has_voucher", voucher: "has_voucher",
  "voucher amount": "voucher_amount", voucher_amount: "voucher_amount",
  "housing authority": "housing_authority", housing_authority: "housing_authority",
  authority: "housing_authority",
  "preferred language": "preferred_language", preferred_language: "preferred_language",
  language: "preferred_language", lang: "preferred_language", idioma: "preferred_language",
  source: "source", "lead source": "source", lead_source: "source",
  origin: "source", fuente: "source",
  notes: "notes", note: "notes", comments: "notes", comment: "notes",
  remarks: "notes", remark: "notes", memo: "notes", description: "notes",
  notas: "notes", observaciones: "notes", comentarios: "notes",
};

function detectFieldByContent(values: string[], alreadyMapped: Set<string>): MappableFieldKey | null {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return null;
  const threshold = 0.5;

  if (!alreadyMapped.has("email")) {
    const emailCount = nonEmpty.filter((v) => v.includes("@")).length;
    if (emailCount / nonEmpty.length >= threshold) return "email";
  }
  if (!alreadyMapped.has("phone")) {
    const phoneCount = nonEmpty.filter((v) => {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }).length;
    if (phoneCount / nonEmpty.length >= threshold) return "phone";
  }
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
  updated: number;
  skippedMissingContact: number;
  issues: Array<{ row: number; reason: string }>;
  propertyName?: string;
  // For email campaign — consent-eligible recipients only
  leadsWithEmail: Array<{ id: string; email: string; full_name: string | null }>;
  // Leads with email excluded from the campaign (unsubscribed / declined
  // marketing consent / do_not_contact)
  campaignSuppressed: number;
  // Rows the client counted as "new" but the DB dedup trigger merged into an
  // existing lead on insert (e.g. a lead created between analysis and import),
  // so they never became new rows.
  mergedByDedup: number;
  // An insert batch failed mid-import: not every "new" row was committed.
  partialFailure: boolean;
}

interface AnalyzedLead {
  rowNum: number;
  name: string;
  phone: string;
  email: string;
  data: Record<string, unknown>;
}

interface DuplicateLead {
  rowNum: number;
  name: string;
  contact: string;
  reason: string;
  existingLeadId: string;
  data: Record<string, unknown>;
}

interface PreImportAnalysis {
  newLeads: AnalyzedLead[];
  duplicates: DuplicateLead[];
  missingContact: Array<{ rowNum: number; name: string }>;
  totalRows: number;
  detectedProperty: PropertyInfo | null;
  mappedFields: string[];
  unmappedColumns: string[];
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

// Normalize a phone to E.164 for storage (US default). Falls back to the
// trimmed original if it can't be confidently normalized so no data is lost.
function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;        // already international
  if (digits.length === 10) return `+1${digits}`;          // US 10-digit
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

// Robustly parse a move-in date from CSV/Excel input. Handles Excel date
// serials (e.g. "46000"), ISO yyyy-mm-dd, and US slash dates (MM/DD/YYYY,
// falling back to DD/MM/YYYY only when the first number can't be a month).
// Returns a YYYY-MM-DD string, or null when the value can't be parsed.
function parseMoveInDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // Excel date serial (numeric): days since the Excel epoch (1899-12-30).
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (serial >= 10000 && serial <= 100000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    return null;
  }

  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  }

  // Slash/dash dates — US locale first: MM/DD/YYYY (or MM-DD-YYYY). Fall back
  // to DD/MM/YYYY only when the first number can't be a month (e.g. "25/07/2026").
  const mdy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    const first = Number(mdy[1]);
    const second = Number(mdy[2]);
    const [month, day] = first > 12 ? [second, first] : [first, second];
    const year = Number(mdy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() === year &&
      d.getUTCMonth() === month - 1 &&
      d.getUTCDate() === day
    ) {
      return d.toISOString().split("T")[0];
    }
    return null;
  }

  return null;
}

// Fuzzy match CSV content against known properties
function detectPropertyFromCsv(
  headers: string[],
  data: Record<string, string>[],
  properties: PropertyInfo[]
): PropertyInfo | null {
  if (properties.length === 0) return null;

  // Normalize property addresses for matching
  const normalizeAddr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const propMap = properties.map((p) => ({
    prop: p,
    normalized: normalizeAddr(p.address),
    addressWords: p.address.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
  }));

  // Strategy 1: Check if any header contains a property address
  for (const header of headers) {
    const normHeader = normalizeAddr(header);
    for (const { prop, normalized } of propMap) {
      if (normHeader.includes(normalized) || normalized.includes(normHeader)) {
        return prop;
      }
    }
  }

  // Strategy 2: Scan cell values in first 20 rows for address matches
  const sampleRows = data.slice(0, 20);
  const allValues: string[] = [];
  for (const row of sampleRows) {
    for (const val of Object.values(row)) {
      if (val && val.trim().length > 5) allValues.push(val.trim());
    }
  }

  for (const value of allValues) {
    const normVal = normalizeAddr(value);
    for (const { prop, normalized, addressWords } of propMap) {
      // Exact normalized match
      if (normVal.includes(normalized) || normalized.includes(normVal)) {
        return prop;
      }
      // Word-based match: if 2+ significant address words appear in the value
      const valLower = value.toLowerCase();
      const matchingWords = addressWords.filter((w) => valLower.includes(w));
      if (matchingWords.length >= 2) {
        return prop;
      }
    }
  }

  return null;
}

export const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
  properties,
}) => {
  const { userRecord } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Upload, Step 2: Review/Import
  const [step, setStep] = useState<1 | 2>(1);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Analysis
  const [preImportAnalysis, setPreImportAnalysis] = useState<PreImportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewTab, setReviewTab] = useState<"import" | "updates">("import");

  // Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Email campaign
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ sent: 0, total: 0 });
  const [campaignDone, setCampaignDone] = useState(false);

  // ── File parsing ─────────────────────────────────────────────────
  const parseFile = async (selectedFile: File): Promise<{ headers: string[]; data: Record<string, string>[] }> => {
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();

    if (extension === "xlsx" || extension === "xls") {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

      if (jsonData.length === 0) return { headers: [], data: [] };

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

  // ── Build lead objects from file data ────────────────────────────
  const buildLeadsFromFile = (mapping: Record<string, string>, data: Record<string, string>[], headers: string[]) => {
    const validLeads: Array<Record<string, unknown> & { _rowNum: number }> = [];
    const missingContact: Array<{ rowNum: number; name: string }> = [];

    const phoneColumn = Object.entries(mapping).find(([_, field]) => field === "phone")?.[0];
    const emailColumn = Object.entries(mapping).find(([_, field]) => field === "email")?.[0];
    const nameColumn = Object.entries(mapping).find(([_, field]) => field === "full_name")?.[0]
      || Object.entries(mapping).find(([_, field]) => field === "first_name")?.[0];

    // Identify unmapped columns (for auto-notes)
    const unmappedCols = headers.filter((h) => mapping[h] === "skip");

    data.forEach((row, index) => {
      const rowNum = index + 2;
      const phoneValue = phoneColumn ? row[phoneColumn]?.trim() : "";
      const emailValue = emailColumn ? row[emailColumn]?.trim() : "";
      const nameValue = nameColumn ? row[nameColumn]?.trim() : "";

      if (!phoneValue && !emailValue) {
        missingContact.push({ rowNum, name: nameValue || "—" });
        return;
      }

      const hasPhoneOnly = !!phoneValue;
      const lead: Record<string, unknown> & { _rowNum: number } = {
        _rowNum: rowNum,
        source: "csv_import",
        status: hasPhoneOnly ? "new" : "nurturing",
      };
      if (phoneValue) lead.phone = phoneValue;
      if (emailValue) lead.email = emailValue;

      // Values that couldn't be parsed into their column — preserved as notes
      // instead of being silently dropped
      const unparsedParts: string[] = [];

      // Map known fields
      Object.entries(mapping).forEach(([fileCol, ourField]) => {
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
            const parsed = parseMoveInDate(value);
            if (parsed) lead[ourField] = parsed;
            else unparsedParts.push(`Move-in date (unparsed): ${value}`);
            break;
          }
          default:
            lead[ourField] = value;
        }
      });

      // Append unmapped columns + unparsed values as extra notes
      const extraParts: string[] = [...unparsedParts];
      unmappedCols.forEach((col) => {
        const val = row[col]?.trim();
        if (val) extraParts.push(`${col}: ${val}`);
      });
      if (extraParts.length > 0) {
        const existingNotes = (lead.notes as string) || "";
        lead.notes = existingNotes
          ? `${existingNotes}\n${extraParts.join(" | ")}`
          : extraParts.join(" | ");
      }

      validLeads.push(lead);
    });

    return { validLeads, missingContact };
  };

  // ── Smart upload: parse + auto-map + detect property + analyze ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !userRecord?.organization_id) return;

    setFile(selectedFile);
    setAnalyzing(true);
    setReviewTab("import");

    try {
      const { headers, data } = await parseFile(selectedFile);

      if (data.length === 0) {
        toast.error("File is empty or has no data rows.");
        setAnalyzing(false);
        return;
      }

      setFileHeaders(headers);
      setFileData(data);

      // ── Auto-map columns ──
      const autoMapping: Record<string, string> = {};
      const alreadyMapped = new Set<string>();

      // Pass 1: alias match
      headers.forEach((header) => {
        const normalizedHeader = header.toLowerCase().trim();
        const mappedField = COLUMN_ALIASES[normalizedHeader];
        if (mappedField) {
          if (alreadyMapped.has(mappedField)) {
            // Field already claimed by an earlier column — don't map twice
            // (that would overwrite/drop data). Route the extra column to notes.
            autoMapping[header] = "skip";
          } else {
            autoMapping[header] = mappedField;
            alreadyMapped.add(mappedField);
          }
        }
      });

      // Pass 2: content-based detection
      const sampleRows = data.slice(0, 10);
      headers.forEach((header) => {
        if (autoMapping[header]) return;
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

      // Check if phone or email is mapped
      const mappedValues = Object.values(autoMapping);
      if (!mappedValues.includes("phone") && !mappedValues.includes("email")) {
        toast.error("Could not detect phone or email columns. Please check your file.");
        setAnalyzing(false);
        return;
      }

      // ── Auto-detect property ──
      const detectedProperty = detectPropertyFromCsv(headers, data, properties);

      // ── Build leads + analyze duplicates ──
      const { validLeads, missingContact } = buildLeadsFromFile(autoMapping, data, headers);
      const hasProperty = !!detectedProperty;

      // Fetch existing leads for dedup — paginate past PostgREST's 1000-row cap,
      // else dedup only sees the first 1000 of ~18.8k leads and re-imports the
      // rest as brand-new duplicates on every import.
      const existingLeads: { id: string; phone: string | null; email: string | null }[] = [];
      const DEDUP_PAGE = 1000;
      for (let from = 0; from < 100000; from += DEDUP_PAGE) {
        const { data, error } = await supabase
          .from("leads")
          .select("id, phone, email")
          .eq("organization_id", userRecord.organization_id)
          .order("id", { ascending: true })
          .range(from, from + DEDUP_PAGE - 1);
        if (error) {
          console.error("Failed to fetch existing leads for dedup:", error.message);
          break;
        }
        existingLeads.push(...(data || []));
        if (!data || data.length < DEDUP_PAGE) break;
      }

      const existingPhoneMap = new Map<string, string>();
      const existingEmailMap = new Map<string, string>();
      existingLeads.forEach((l) => {
        if (l.phone) existingPhoneMap.set(normalizePhone(l.phone), l.id);
        if (l.email) existingEmailMap.set(l.email.toLowerCase().trim(), l.id);
      });

      const newLeads: AnalyzedLead[] = [];
      const duplicates: DuplicateLead[] = [];
      const seenPhones = new Set<string>();
      const seenEmails = new Set<string>();

      validLeads.forEach((lead) => {
        const phone = lead.phone ? normalizePhone(lead.phone as string) : "";
        const email = lead.email ? (lead.email as string).toLowerCase().trim() : "";
        const firstName = (lead.first_name as string) || "";
        const lastName = (lead.last_name as string) || "";
        const fullName = (lead.full_name as string) || [firstName, lastName].filter(Boolean).join(" ");

        // Check phone match first
        const phoneMatch = phone ? (existingPhoneMap.get(phone) || (seenPhones.has(phone) ? "seen" : null)) : null;
        // Check email match (ALWAYS, not just when phone is missing)
        const emailMatch = email ? (existingEmailMap.get(email) || (seenEmails.has(email) ? "seen" : null)) : null;

        const existingId = (phoneMatch && phoneMatch !== "seen") ? phoneMatch
          : (emailMatch && emailMatch !== "seen") ? emailMatch
          : null;

        if (phoneMatch || emailMatch) {
          if (existingId) {
            duplicates.push({
              rowNum: lead._rowNum,
              name: fullName || "—",
              contact: (lead.phone as string) || (lead.email as string) || "",
              reason: phoneMatch ? "Existing lead (phone)" : "Existing lead (email)",
              existingLeadId: existingId,
              data: lead,
            });
          }
          // Also a dup if seen in current CSV batch (skip silently)
          return;
        }

        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);

        newLeads.push({
          rowNum: lead._rowNum,
          name: fullName || "—",
          phone: (lead.phone as string) || "",
          email: (lead.email as string) || "",
          data: lead,
        });
      });

      const mappedFields = Object.entries(autoMapping)
        .filter(([_, field]) => field !== "skip")
        .map(([_, field]) => MAPPABLE_FIELDS.find((f) => f.key === field)?.label || field);
      const unmappedColumns = headers.filter((h) => autoMapping[h] === "skip");

      setPreImportAnalysis({
        newLeads,
        duplicates,
        missingContact,
        totalRows: data.length,
        detectedProperty,
        mappedFields,
        unmappedColumns,
      });
      setStep(2);
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze file. Please check the format.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Import handler ───────────────────────────────────────────────
  const handleImport = async () => {
    if (!userRecord?.organization_id || !preImportAnalysis) return;
    const { newLeads, duplicates, missingContact } = preImportAnalysis;
    if (newLeads.length === 0 && duplicates.length === 0) return;

    setImporting(true);

    try {
      const detectedProp = preImportAnalysis.detectedProperty;
      const effectivePropertyId = detectedProp?.id || null;
      const uploaderName = userRecord.full_name || userRecord.email || "Unknown user";
      const now = new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const propertyNote = detectedProp ? ` — matched to ${detectedProp.address}` : "";

      // ── 1. Insert new leads ──
      const leadNoteTexts: Map<string, string> = new Map();
      const leadsWithOrg = newLeads.map((analyzed) => {
        const lead = analyzed.data;
        const phone = (lead.phone as string) || "";
        const email = (lead.email as string) || "";
        const phoneE164 = phone ? normalizePhoneE164(phone) : "";
        const dedupKey = phone ? normalizePhone(phone) : email.toLowerCase().trim();
        if (lead.notes) leadNoteTexts.set(dedupKey, lead.notes as string);
        // Strip fields that are not DB columns
        const { notes, _rowNum, ...cleanLead } = lead;
        // Mirror of the DB leads_source_check constraint
        const VALID_SOURCES = [
          "website", "phone", "referral", "zillow", "apartments_com", "facebook",
          "hemlane", "hemlane_email", "csv_import", "manual", "campaign",
          "inbound_call", "sms", "other",
        ];
        const csvSource = (cleanLead.source as string) || "";
        return {
          ...cleanLead,
          organization_id: userRecord.organization_id,
          source: VALID_SOURCES.includes(csvSource) ? csvSource : "csv_import",
          stage: "prospect",
          full_name: analyzed.name !== "—" ? analyzed.name : null,
          ...(phoneE164 ? { phone: phoneE164 } : {}),
          ...(email ? { email } : {}),
        };
      });

      // Insert in batches of 50 to avoid payload limits. `.select()` returns
      // the inserted rows directly — no phone/email refetch (which silently
      // capped at PostgREST's 1000 rows and lost notes/tags on large imports).
      type InsertedLead = {
        id: string;
        phone: string | null;
        email: string | null;
        full_name: string | null;
        unsubscribed_at: string | null;
        email_marketing_consent: boolean | null;
        do_not_contact: boolean | null;
      };
      const LEAD_RETURN_COLS =
        "id, phone, email, full_name, unsubscribed_at, email_marketing_consent, do_not_contact";
      const insertedLeads: InsertedLead[] = [];
      let insertFailed = false;
      let insertErrorMsg = "";
      if (leadsWithOrg.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < leadsWithOrg.length; i += BATCH_SIZE) {
          const batch = leadsWithOrg.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabase
            .from("leads")
            .insert(batch as any)
            .select(LEAD_RETURN_COLS);
          if (error) {
            console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message, error.details, error.hint);
            console.error("First row in failed batch:", JSON.stringify(batch[0], null, 2));
            // Don't throw: earlier batches are already committed (no transaction
            // spans them). Stop inserting and record a PARTIAL result so the UI
            // advances to the "Done" screen instead of re-offering "Import N" —
            // a naive retry would re-send already-committed rows, which the DB
            // dedup trigger merges, bumping last_contact_at across the batch.
            insertFailed = true;
            insertErrorMsg = error.message || "insert failed";
            break;
          }
          insertedLeads.push(...((data || []) as InsertedLead[]));
        }
      }

      const allNotes: Record<string, unknown>[] = [];
      if (insertedLeads.length > 0) {
        insertedLeads.forEach((lead) => {
          allNotes.push({
            lead_id: lead.id,
            organization_id: userRecord.organization_id,
            created_by: userRecord.id,
            content: `Imported via CSV by ${uploaderName} on ${now}${propertyNote}`,
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
      }

      // ── 2. Update existing (duplicate) leads ──
      // One batched, org-scoped UPDATE per chunk instead of a serial
      // round-trip per row (a 500-dup re-import used to keep the dialog on
      // "Processing..." for minutes).
      const dupIds = [...new Set(duplicates.map((d) => d.existingLeadId))];
      const updatedLeadIds: string[] = [];
      const UPDATE_CHUNK = 100;
      for (let i = 0; i < dupIds.length; i += UPDATE_CHUNK) {
        const chunk = dupIds.slice(i, i + UPDATE_CHUNK);
        const { data: touched, error: updateErr } = await supabase
          .from("leads")
          .update({ updated_at: new Date().toISOString() })
          .in("id", chunk)
          .eq("organization_id", userRecord.organization_id)
          .select("id");
        if (updateErr) {
          console.error(`Duplicate update chunk ${i / UPDATE_CHUNK + 1} failed:`, updateErr.message);
          continue;
        }
        updatedLeadIds.push(...((touched || []) as { id: string }[]).map((t) => t.id));
      }
      const updatedCount = updatedLeadIds.length;
      const updatedIdSet = new Set(updatedLeadIds);
      for (const dup of duplicates) {
        if (!updatedIdSet.has(dup.existingLeadId)) continue;
        const noteContent = effectivePropertyId
          ? `Property tagged: ${detectedProp?.address || "new property"} via CSV import by ${uploaderName}`
          : `Re-imported via CSV by ${uploaderName} (existing lead updated)`;
        allNotes.push({
          lead_id: dup.existingLeadId,
          organization_id: userRecord.organization_id,
          created_by: userRecord.id,
          content: noteContent,
          note_type: "system",
        });
        const csvNote = dup.data.notes as string | undefined;
        if (csvNote) {
          allNotes.push({
            lead_id: dup.existingLeadId,
            organization_id: userRecord.organization_id,
            created_by: userRecord.id,
            content: csvNote,
            note_type: "manual",
          });
        }
      }

      // ── 3. Tag imported + updated leads with the batch property (additive) ──
      if (effectivePropertyId) {
        const tagLeadIds = [...new Set([...insertedLeads.map((l) => l.id), ...updatedLeadIds])];
        if (tagLeadIds.length > 0) {
          try {
            await upsertLeadTags(userRecord.organization_id, tagLeadIds, effectivePropertyId, "csv_import");
          } catch (tagErr) {
            console.error("Property tagging failed:", tagErr);
            toast.error("Leads imported, but property tagging failed");
          }
        }
      }

      if (allNotes.length > 0) {
        // supabase-js returns { error } rather than throwing, so an unchecked
        // insert here silently dropped the whole batch (audit note + per-lead
        // CSV notes + preserved unmapped/unparsed columns). Surface failures.
        const { error: notesError } = await supabase
          .from("lead_notes")
          .insert(allNotes as any);
        if (notesError) {
          console.error("Failed to save import notes:", notesError.message, notesError.details);
          toast.error("Leads imported, but the import notes could not be saved");
        }
      }

      // ── Collect leads with email for campaign (consent-gated) ──
      // The post-import blast is marketing mail: never target leads that
      // unsubscribed, declined email marketing consent, or are flagged
      // do_not_contact — same fail-closed gate as the Spotlight sender.
      const isSuppressed = (l: InsertedLead) =>
        l.unsubscribed_at != null ||
        l.email_marketing_consent === false ||
        l.do_not_contact === true;

      const leadsWithEmail: ImportResult["leadsWithEmail"] = [];
      let campaignSuppressed = 0;
      const collectRecipient = (l: InsertedLead) => {
        if (!l.email) return;
        if (isSuppressed(l)) {
          campaignSuppressed++;
          return;
        }
        leadsWithEmail.push({ id: l.id, email: l.email, full_name: l.full_name });
      };
      // From newly inserted
      insertedLeads.forEach(collectRecipient);
      // From updated duplicates — fetch emails + consent flags, chunked to stay
      // under PostgREST's 1000-row cap and URL length limits
      for (let i = 0; i < updatedLeadIds.length; i += 500) {
        const chunk = updatedLeadIds.slice(i, i + 500);
        const { data: updatedData, error: updatedErr } = await supabase
          .from("leads")
          .select(LEAD_RETURN_COLS)
          .eq("organization_id", userRecord.organization_id)
          .in("id", chunk);
        if (updatedErr) {
          // Fail closed: if consent can't be read, keep the chunk out of the
          // campaign list entirely.
          console.error("Consent fetch for updated leads failed:", updatedErr.message);
          campaignSuppressed += chunk.length;
          continue;
        }
        ((updatedData || []) as InsertedLead[]).forEach(collectRecipient);
      }

      // Report the rows that ACTUALLY committed — not the analyzed count. The DB
      // dedup trigger can silently merge a row the client snapshot saw as "new"
      // into an existing lead, so insertedLeads.length is the truth.
      const mergedByDedup = insertFailed
        ? 0
        : Math.max(0, newLeads.length - insertedLeads.length);

      setImportResult({
        imported: insertedLeads.length,
        updated: updatedCount,
        skippedMissingContact: missingContact.length,
        issues: missingContact.map((m) => ({ row: m.rowNum, reason: "Missing phone & email" })),
        propertyName: detectedProp?.address,
        leadsWithEmail,
        campaignSuppressed,
        mergedByDedup,
        partialFailure: insertFailed,
      });

      const parts: string[] = [];
      if (insertedLeads.length > 0) parts.push(`${insertedLeads.length} imported`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (mergedByDedup > 0) parts.push(`${mergedByDedup} merged into existing`);
      if (insertFailed) {
        toast.error(`Import stopped after an error: ${parts.join(", ") || "no rows saved"} (${insertErrorMsg})`);
      } else {
        toast.success(`Successfully ${parts.join(", ") || "processed the file"}`);
      }
    } catch (error: any) {
      console.error("Import error:", error);
      const msg = error?.message || error?.details || "Unknown error";
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  // ── Email campaign ───────────────────────────────────────────────
  // Queues one email per recipient through the send-notification-email edge
  // function (service-role inserts the email_events row — the frontend has no
  // INSERT policy on that table). process-email-queue drains at the org's send
  // rate, fills the per-recipient {{unsubscribe_url}} and adds List-Unsubscribe
  // headers because the notification_type is "campaign"-prefixed.
  const handleSendCampaign = async () => {
    if (!importResult || !preImportAnalysis?.detectedProperty || !userRecord?.organization_id) return;

    const prop = preImportAnalysis.detectedProperty;
    const leads = importResult.leadsWithEmail;
    if (leads.length === 0) return;

    setSendingCampaign(true);
    setCampaignProgress({ sent: 0, total: leads.length });

    const bookingUrl = `${window.location.origin}/p/schedule-showing/${prop.id}`;

    const buildHtml = (lead: { full_name: string | null }) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background-color:#4F46E5;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#ffb22c;font-size:20px;">Rent Finder Cleveland</h1>
    </div>
    <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
      ${showingInvitationTemplate({
        leadName: lead.full_name || "there",
        propertyAddress: `${prop.address}${prop.city ? `, ${prop.city}` : ""}`,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        rentPrice: prop.rent_price,
        bookingUrl,
      })}
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        You are receiving this email because you inquired about a rental home with Rent Finder Cleveland.
      </p>
      <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        ${DEFAULT_MARKETING_POSTAL_ADDRESS}
      </p>
      <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        <a href="${UNSUBSCRIBE_URL_PLACEHOLDER}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from marketing emails.
      </p>
    </div>
  </div>
</body>
</html>`;

    // Queue in small parallel batches and count real results — the progress
    // counter reflects invoke outcomes, not loop laps.
    let queued = 0;
    let failed = 0;
    const INVOKE_BATCH = 10;
    for (let i = 0; i < leads.length; i += INVOKE_BATCH) {
      const batch = leads.slice(i, i + INVOKE_BATCH);
      const results = await Promise.allSettled(
        batch.map((lead) =>
          supabase.functions.invoke("send-notification-email", {
            body: {
              to: lead.email,
              subject: `Schedule a Showing — ${prop.address}`,
              html: buildHtml(lead),
              notification_type: "campaign_showing_invitation",
              organization_id: userRecord.organization_id,
              related_entity_id: lead.id,
              related_entity_type: "lead",
              queue: true,
            },
          }),
        ),
      );
      for (const r of results) {
        // invoke resolves with { error } on HTTP 4xx/5xx and rejects on
        // network failures — both count as NOT queued.
        if (r.status === "fulfilled" && !r.value.error) {
          queued++;
        } else {
          failed++;
          console.error(
            "Campaign email failed to queue:",
            r.status === "rejected" ? r.reason : r.value.error,
          );
        }
      }
      setCampaignProgress({ sent: queued, total: leads.length });
    }

    setCampaignDone(queued > 0);
    setSendingCampaign(false);
    if (failed > 0) {
      toast.error(`${queued} emails queued, ${failed} failed to queue`);
    } else {
      toast.success(`Campaign queued for ${queued} leads`);
    }
  };

  // ── Download template ────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = MAPPABLE_FIELDS.map((f) => f.label);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Leads Template");
    XLSX.writeFile(wb, "leads_import_template.xlsx");
  };

  // ── Reset / Navigation ───────────────────────────────────────────
  const handleClose = (isOpen: boolean) => {
    // Block dismissal while an import OR an email campaign is still running.
    // Closing mid-campaign wipes the progress UI while background invokes keep
    // firing, and a re-run would double-queue the same recipients.
    if (!importing && !sendingCampaign) {
      onOpenChange(isOpen);
      if (!isOpen) {
        setStep(1);
        setFile(null);
        setFileHeaders([]);
        setFileData([]);
        setColumnMapping({});
        setImportResult(null);
        setPreImportAnalysis(null);
        setCampaignDone(false);
        setCampaignProgress({ sent: 0, total: 0 });
        setSendingCampaign(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleFinish = () => {
    handleClose(false);
    onSuccess();
  };

  const goBack = () => {
    setStep(1);
    setFile(null);
    setFileHeaders([]);
    setFileData([]);
    setColumnMapping({});
    setPreImportAnalysis(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Stepper UI ───────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2].map((s, idx) => (
        <React.Fragment key={s}>
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
              step >= s ? "bg-[#4F46E5] text-white" : "bg-[#e5e7eb] text-[#6b7280]"
            )}
          >
            {step > s ? <Check className="h-4 w-4" /> : s}
          </div>
          {idx < 1 && (
            <div className={cn("w-12 h-0.5 transition-colors", step > s ? "bg-[#4F46E5]" : "bg-[#e5e7eb]")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Leads
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Upload a file to smart-import leads into your pipeline."}
            {step === 2 && !importResult && "Review and confirm your import."}
            {step === 2 && importResult && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        <div className="flex-1 overflow-hidden">
          {/* Step 1: File Upload Only */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-[#f3f4f6] p-4 text-sm space-y-3">
                <p className="font-medium text-[#4F46E5]">Supported formats:</p>
                <div className="flex flex-wrap gap-2">
                  {[".csv", ".tsv", ".xlsx", ".xls"].map((ext) => (
                    <span key={ext} className="px-2 py-1 bg-white border border-[#e5e7eb] rounded text-xs font-mono">
                      {ext}
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  Upload your file — columns, property, and duplicates are detected automatically.
                </p>
                <Button variant="link" size="sm" className="p-0 h-auto text-[#4F46E5]" onClick={downloadTemplate}>
                  <Download className="h-3 w-3 mr-1" />
                  Download template (.xlsx)
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-file">Select file</Label>
                <Input
                  ref={fileInputRef}
                  id="import-file"
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                  disabled={analyzing}
                />
              </div>

              {analyzing && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#4F46E5]/5 text-[#4F46E5] text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing file...</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review & Import */}
          {step === 2 && !importResult && preImportAnalysis && (
            <div className="space-y-3">
              {/* Summary stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-[#f3f4f6] p-2.5 text-center">
                  <p className="text-lg font-bold text-[#374151]">{preImportAnalysis.totalRows}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Rows</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-green-700">{preImportAnalysis.newLeads.length}</p>
                  <p className="text-[10px] text-green-600 uppercase">New</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-blue-700">{preImportAnalysis.duplicates.length}</p>
                  <p className="text-[10px] text-blue-600 uppercase">Existing</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-700">{preImportAnalysis.missingContact.length}</p>
                  <p className="text-[10px] text-red-600 uppercase">No Contact</p>
                </div>
              </div>

              {/* Detected property + mapped fields */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {preImportAnalysis.detectedProperty ? (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {preImportAnalysis.detectedProperty.address}
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-[#f3f4f6] text-muted-foreground rounded font-medium">
                    No property detected
                  </span>
                )}
                <span className="px-2 py-1 bg-[#4F46E5]/10 text-[#4F46E5] rounded font-medium">
                  Stage: Prospect
                </span>
                {preImportAnalysis.mappedFields.map((field) => (
                  <span key={field} className="px-2 py-1 bg-[#f3f4f6] text-[#6b7280] rounded">
                    {field}
                  </span>
                ))}
                {preImportAnalysis.unmappedColumns.length > 0 && (
                  <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-medium">
                    +{preImportAnalysis.unmappedColumns.length} cols → notes
                  </span>
                )}
              </div>

              {/* Tabs */}
              {(preImportAnalysis.duplicates.length > 0 || preImportAnalysis.missingContact.length > 0) && (
                <div className="flex border-b border-[#e5e7eb]">
                  <button
                    onClick={() => setReviewTab("import")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      reviewTab === "import"
                        ? "border-[#4F46E5] text-[#4F46E5]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    New ({preImportAnalysis.newLeads.length})
                  </button>
                  {preImportAnalysis.duplicates.length > 0 && (
                    <button
                      onClick={() => setReviewTab("updates")}
                      className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                        reviewTab === "updates"
                          ? "border-blue-600 text-blue-700"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      To Update ({preImportAnalysis.duplicates.length})
                    </button>
                  )}
                </div>
              )}

              {/* New leads table */}
              {reviewTab === "import" && (
                <ScrollArea className="h-[220px] border border-[#e5e7eb] rounded-lg">
                  {preImportAnalysis.newLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mb-2" />
                      <p className="text-sm font-medium">No new leads to import</p>
                      <p className="text-xs">All rows are existing leads that will be updated.</p>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-[#f3f4f6] sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151] w-10">Row</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Phone</th>
                          <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Email</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ScrollArea>
              )}

              {/* Updates table */}
              {reviewTab === "updates" && (
                <ScrollArea className="h-[220px] border border-[#e5e7eb] rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f3f4f6] sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151] w-10">Row</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Name</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Contact</th>
                        <th className="px-2 py-1.5 text-left font-medium text-[#374151]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preImportAnalysis.duplicates.map((dup) => (
                        <tr key={`dup-${dup.rowNum}`} className="border-t border-[#e5e7eb]">
                          <td className="px-2 py-1.5 text-muted-foreground">{dup.rowNum}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{dup.name}</td>
                          <td className="px-2 py-1.5 font-mono truncate max-w-[120px]">{dup.contact}</td>
                          <td className="px-2 py-1.5">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
                              Update property
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
          {step === 2 && importResult && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-6">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center mb-4",
                  (importResult.imported > 0 || importResult.updated > 0) ? "bg-green-100" : "bg-amber-100"
                )}>
                  <Check className={cn(
                    "h-8 w-8",
                    (importResult.imported > 0 || importResult.updated > 0) ? "text-green-600" : "text-amber-600"
                  )} />
                </div>
                <h3 className="text-lg font-semibold text-[#4F46E5]">Import Complete!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {importResult.imported > 0 && importResult.updated > 0
                    ? `${importResult.imported} imported, ${importResult.updated} updated`
                    : importResult.imported > 0
                    ? `Successfully imported ${importResult.imported} prospects`
                    : importResult.updated > 0
                    ? `Successfully updated ${importResult.updated} existing leads`
                    : "No changes were made"}
                </p>
                {importResult.propertyName && (
                  <span className="mt-2 px-2 py-1 bg-[#4F46E5]/10 text-[#4F46E5] rounded text-xs flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {importResult.propertyName}
                  </span>
                )}
              </div>

              {importResult.partialFailure && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-800">
                      The import stopped early after an error — only {importResult.imported} new lead
                      {importResult.imported === 1 ? "" : "s"} were saved. Re-importing the same file is
                      safe (already-saved leads are detected as existing), but review the source before retrying.
                    </p>
                  </div>
                </div>
              )}

              {importResult.mergedByDedup > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {importResult.mergedByDedup} row{importResult.mergedByDedup === 1 ? "" : "s"} matched a lead
                  created since analysis and were merged instead of added.
                </p>
              )}

              {importResult.skippedMissingContact > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-amber-800">
                        {importResult.skippedMissingContact} skipped (missing phone & email)
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

              {/* Email Campaign Section */}
              {importResult.leadsWithEmail.length > 0 && preImportAnalysis?.detectedProperty && !campaignDone && (
                <div className="rounded-lg bg-[#4F46E5]/5 border border-[#4F46E5]/20 p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-[#4F46E5] mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-[#4F46E5] text-sm">Send Showing Invitation</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Send a branded email inviting {importResult.leadsWithEmail.length} leads to schedule a showing at{" "}
                        <strong>{preImportAnalysis.detectedProperty.address}</strong>.
                      </p>
                      {importResult.campaignSuppressed > 0 && (
                        <p className="text-xs text-amber-700 mt-1">
                          {importResult.campaignSuppressed} lead{importResult.campaignSuppressed === 1 ? "" : "s"} excluded
                          (unsubscribed, no marketing consent, or do-not-contact).
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="mt-3 bg-[#4F46E5] hover:bg-[#4F46E5]/90"
                        onClick={handleSendCampaign}
                        disabled={sendingCampaign}
                      >
                        {sendingCampaign ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Queuing {campaignProgress.sent} of {campaignProgress.total}...
                          </>
                        ) : (
                          <>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Campaign ({importResult.leadsWithEmail.length} emails)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {importResult.leadsWithEmail.length === 0 &&
                importResult.campaignSuppressed > 0 &&
                preImportAnalysis?.detectedProperty && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Invitation campaign unavailable — all {importResult.campaignSuppressed} leads with email
                      are excluded (unsubscribed, no marketing consent, or do-not-contact).
                    </p>
                  </div>
                </div>
              )}

              {campaignDone && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-600" />
                    <p className="text-sm font-medium text-green-800">
                      Campaign queued for {campaignProgress.sent} leads — emails go out automatically at the send rate.
                    </p>
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

          {step === 2 && !importResult && (
            <>
              <Button variant="outline" onClick={goBack} disabled={importing}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !preImportAnalysis || (preImportAnalysis.newLeads.length === 0 && preImportAnalysis.duplicates.length === 0)}
                className="bg-[#4F46E5] hover:bg-[#4F46E5]/90"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {(() => {
                      const parts: string[] = [];
                      const newCount = preImportAnalysis?.newLeads.length || 0;
                      const updateCount = preImportAnalysis?.duplicates.length || 0;
                      if (newCount > 0) parts.push(`Import ${newCount}`);
                      if (updateCount > 0) parts.push(`Update ${updateCount}`);
                      return parts.join(" + ") || "Import";
                    })()}
                  </>
                )}
              </Button>
            </>
          )}

          {step === 2 && importResult && (
            <>
              <div />
              <Button onClick={handleFinish} className="bg-[#4F46E5] hover:bg-[#4F46E5]/90">
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
