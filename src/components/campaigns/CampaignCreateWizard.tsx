import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  AlertCircle,
  Rocket,
  Mail,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendNotificationEmail } from "@/lib/notificationService";
import {
  renderEmailHtml,
  DEFAULT_CONFIGS,
} from "@/lib/emailTemplateDefaults";
import type { EmailTemplateConfig } from "@/lib/emailTemplateDefaults";
import { CampaignProgressPanel } from "./CampaignProgressPanel";

// ── Column auto-mapping ──────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string> = {
  phone: "phone", "phone number": "phone", phone_number: "phone", telephone: "phone",
  mobile: "phone", cell: "phone", tel: "phone", celular: "phone", telefono: "phone",
  email: "email", "email address": "email", email_address: "email", "e-mail": "email",
  mail: "email", correo: "email",
  "first name": "first_name", firstname: "first_name", first_name: "first_name",
  fname: "first_name", nombre: "first_name",
  "last name": "last_name", lastname: "last_name", last_name: "last_name",
  lname: "last_name", apellido: "last_name",
  "full name": "full_name", fullname: "full_name", full_name: "full_name",
  name: "full_name", contact: "full_name", "nombre completo": "full_name",
};

interface ParsedLead {
  phone?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  [key: string]: string | undefined;
}

interface CampaignCreateWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

export const CampaignCreateWizard = ({ onComplete, onCancel }: CampaignCreateWizardProps) => {
  const { userRecord, organization } = useAuth();
  const orgId = userRecord?.organization_id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 state
  const [campaignName, setCampaignName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  // Step 3 state
  const [isLaunching, setIsLaunching] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [launchStats, setLaunchStats] = useState({ totalLeads: 0, leadsWithEmail: 0 });

  // Fetch properties for selector
  const { data: properties } = useQuery({
    queryKey: ["campaign-properties", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("properties")
        .select("id, address, unit_number, city, bedrooms, bathrooms, rent_price")
        .eq("organization_id", orgId)
        .order("address");
      return data || [];
    },
    enabled: !!orgId,
  });

  // ── File parsing ───────────────────────────────────────────────────

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const isExcel = file.name.match(/\.xlsx?$/i);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        if (json.length > 0) {
          const headers = Object.keys(json[0]);
          setCsvHeaders(headers);
          autoMapColumns(headers);
          setParsedLeads(json.map((row) => mapRow(row, headers)));
        }
      };
      reader.readAsBinaryString(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const headers = result.meta.fields || [];
          setCsvHeaders(headers);
          autoMapColumns(headers);
          setParsedLeads(
            (result.data as Record<string, string>[]).map((row) => mapRow(row, headers))
          );
        },
      });
    }
  }, []);

  const autoMapColumns = (headers: string[]) => {
    const mapping: Record<string, string> = {};
    for (const h of headers) {
      const normalized = h.toLowerCase().trim();
      if (COLUMN_ALIASES[normalized]) {
        mapping[h] = COLUMN_ALIASES[normalized];
      }
    }
    setColumnMapping(mapping);
  };

  const mapRow = (row: Record<string, string>, _headers: string[]): ParsedLead => {
    // Raw row — mapping applied at launch time
    return row as ParsedLead;
  };

  // Apply column mapping to get actual lead data
  const getMappedLeads = (): ParsedLead[] => {
    return parsedLeads.map((raw) => {
      const lead: ParsedLead = {};
      for (const [csvCol, fieldKey] of Object.entries(columnMapping)) {
        const val = raw[csvCol];
        if (val) lead[fieldKey] = val.toString().trim();
      }
      // Build full_name if not directly mapped
      if (!lead.full_name && (lead.first_name || lead.last_name)) {
        lead.full_name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
      }
      return lead;
    });
  };

  const mappedLeads = step >= 2 ? getMappedLeads() : [];
  const leadsWithEmail = mappedLeads.filter((l) => l.email);
  const selectedProperty = properties?.find((p) => p.id === propertyId);

  // ── Step validation ────────────────────────────────────────────────

  const canProceedStep1 = campaignName.trim() && propertyId && parsedLeads.length > 0;
  const canProceedStep2 = leadsWithEmail.length > 0;

  // ── Launch campaign ────────────────────────────────────────────────

  const launchCampaign = async () => {
    if (!orgId || !selectedProperty) return;
    setIsLaunching(true);

    try {
      // 1. Create campaign row
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          organization_id: orgId,
          name: campaignName.trim(),
          property_id: propertyId,
          status: "sending",
          total_leads: mappedLeads.length,
          leads_with_email: leadsWithEmail.length,
          emails_queued: 0,
          created_by: userRecord?.id || null,
        })
        .select("id")
        .single();

      if (campErr || !campaign) throw campErr || new Error("Failed to create campaign");
      const newCampaignId = campaign.id;
      setCampaignId(newCampaignId);
      setLaunchStats({ totalLeads: mappedLeads.length, leadsWithEmail: leadsWithEmail.length });

      // 2. Insert leads + campaign_leads
      let emailsQueued = 0;

      // Get org's welcome template
      const { data: templateSetting } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "email_templates")
        .single();

      let welcomeConfig: EmailTemplateConfig = DEFAULT_CONFIGS.welcome;
      if (templateSetting?.value) {
        try {
          const parsed = JSON.parse(templateSetting.value);
          if (parsed.welcome) welcomeConfig = parsed.welcome;
        } catch (_) { /* use default */ }
      }

      // Get sender domain
      const { data: domainSetting } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "sender_domain")
        .single();
      const senderDomain = domainSetting?.value || "rentfindercleveland.com";
      const orgName = organization?.name || "Rent Finder Cleveland";

      for (const lead of mappedLeads) {
        // Build lead name
        const fullName = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "there";
        const firstName = lead.first_name || fullName.split(" ")[0] || "there";
        const phone = lead.phone || "";
        const email = lead.email || "";

        // Insert lead
        const { data: insertedLead, error: leadErr } = await supabase
          .from("leads")
          .insert({
            organization_id: orgId,
            full_name: fullName !== "there" ? fullName : null,
            first_name: lead.first_name || null,
            last_name: lead.last_name || null,
            phone: phone || `no-phone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            email: email || null,
            source: "campaign",
            status: "new",
            interested_property_id: propertyId,
          })
          .select("id")
          .single();

        if (leadErr || !insertedLead) {
          console.error("Lead insert error:", leadErr?.message);
          continue;
        }

        // Insert campaign_leads junction
        await supabase.from("campaign_leads").insert({
          campaign_id: newCampaignId,
          lead_id: insertedLead.id,
          organization_id: orgId,
        });

        // Queue welcome email if lead has email
        if (email) {
          const propertyAddress = `${selectedProperty.address}${selectedProperty.unit_number ? ` #${selectedProperty.unit_number}` : ""}, ${selectedProperty.city || "Cleveland"}`;
          const variables: Record<string, string> = {
            "{firstName}": firstName,
            "{fullName}": fullName,
            "{propertyAddress}": propertyAddress,
            "{propertyRent}": selectedProperty.rent_price ? `$${selectedProperty.rent_price.toLocaleString()}` : "",
            "{propertyBeds}": selectedProperty.bedrooms?.toString() || "",
            "{propertyBaths}": selectedProperty.bathrooms?.toString() || "",
            "{orgName}": orgName,
            "{senderDomain}": senderDomain,
          };

          const html = renderEmailHtml(welcomeConfig, variables);
          const subject = welcomeConfig.subject
            .replace("{orgName}", orgName)
            .replace("{propertyAddress}", propertyAddress);

          sendNotificationEmail({
            to: email,
            subject,
            html,
            notificationType: "campaign_welcome",
            organizationId: orgId,
            relatedEntityId: insertedLead.id,
            relatedEntityType: "lead",
            queue: true,
            campaignId: newCampaignId,
          });
          emailsQueued++;
        }
      }

      // 3. Update campaign with queued count
      await supabase
        .from("campaigns")
        .update({
          emails_queued: emailsQueued,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", newCampaignId);

      setStep(3);
      toast.success(`Campaign launched! ${emailsQueued} emails queued.`);
    } catch (err) {
      console.error("Campaign launch error:", err);
      toast.error("Failed to launch campaign");
    } finally {
      setIsLaunching(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Setup" },
          { n: 2, label: "Review" },
          { n: 3, label: "Progress" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className={cn("h-px w-8", step >= s.n ? "bg-indigo-400" : "bg-slate-200")} />}
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
              step >= s.n
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-400"
            )}>
              {step > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={cn(
              "text-sm font-medium",
              step >= s.n ? "text-slate-900" : "text-slate-400"
            )}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Setup ────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                placeholder="e.g. March 2026 Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Assign Property</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property..." />
                </SelectTrigger>
                <SelectContent>
                  {properties?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.address}{p.unit_number ? ` #${p.unit_number}` : ""} — {p.city || "Cleveland"}
                      {p.rent_price ? ` ($${p.rent_price}/mo)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Upload Lead Database</Label>
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                fileName
                  ? "border-indigo-300 bg-indigo-50/50"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
              />
              {fileName ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-indigo-500" />
                  <div className="text-left">
                    <p className="font-medium text-slate-900">{fileName}</p>
                    <p className="text-sm text-slate-500">
                      {parsedLeads.length} rows parsed
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                    <Check className="h-3 w-3 mr-1" /> Ready
                  </Badge>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-600">
                    Click to upload CSV or Excel file
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Columns will be auto-mapped (name, email, phone, etc.)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Column mapping preview */}
          {csvHeaders.length > 0 && (
            <div className="space-y-2">
              <Label>Column Mapping</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {csvHeaders.slice(0, 12).map((h) => (
                  <div key={h} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-slate-50">
                    <span className="text-slate-500 truncate flex-1">{h}</span>
                    <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
                    <span className={cn(
                      "font-medium truncate",
                      columnMapping[h] ? "text-indigo-600" : "text-slate-300"
                    )}>
                      {columnMapping[h] || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
            >
              Review
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Review ───────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card variant="glass">
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 mx-auto text-slate-500 mb-2" />
                <p className="text-2xl font-bold">{mappedLeads.length}</p>
                <p className="text-xs text-slate-500">Total Leads</p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4 text-center">
                <Mail className="h-6 w-6 mx-auto text-indigo-500 mb-2" />
                <p className="text-2xl font-bold">{leadsWithEmail.length}</p>
                <p className="text-xs text-slate-500">With Email</p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4 text-center">
                <AlertCircle className="h-6 w-6 mx-auto text-amber-500 mb-2" />
                <p className="text-2xl font-bold">{mappedLeads.length - leadsWithEmail.length}</p>
                <p className="text-xs text-slate-500">No Email</p>
              </CardContent>
            </Card>
            <Card variant="glass">
              <CardContent className="p-4 text-center">
                <Rocket className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
                <p className="text-2xl font-bold">{leadsWithEmail.length}</p>
                <p className="text-xs text-slate-500">Emails to Send</p>
              </CardContent>
            </Card>
          </div>

          {/* Campaign details */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Campaign</span>
              <span className="text-sm font-medium">{campaignName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Property</span>
              <span className="text-sm font-medium">
                {selectedProperty?.address}
                {selectedProperty?.unit_number ? ` #${selectedProperty.unit_number}` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Email Template</span>
              <Badge variant="outline">Welcome Email</Badge>
            </div>
          </div>

          {/* Lead preview */}
          <div className="space-y-2">
            <Label>Lead Preview (first 10)</Label>
            <ScrollArea className="h-48 rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-slate-600">Name</th>
                    <th className="text-left p-2 font-medium text-slate-600">Email</th>
                    <th className="text-left p-2 font-medium text-slate-600">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedLeads.slice(0, 10).map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-slate-900">
                        {l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="p-2 text-slate-600">{l.email || "—"}</td>
                      <td className="p-2 text-slate-600">{l.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button
              onClick={launchCampaign}
              disabled={!canProceedStep2 || isLaunching}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isLaunching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Launch Campaign ({leadsWithEmail.length} emails)
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Live Progress ────────────────────────────────────── */}
      {step === 3 && campaignId && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <Check className="h-3 w-3 mr-1" /> Launched
            </Badge>
            <span className="text-sm text-slate-600">
              Campaign &ldquo;{campaignName}&rdquo; is processing
            </span>
          </div>

          <CampaignProgressPanel
            campaignId={campaignId}
            totalLeads={launchStats.totalLeads}
            leadsWithEmail={launchStats.leadsWithEmail}
          />

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onComplete}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
