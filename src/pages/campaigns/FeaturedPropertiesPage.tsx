import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Star,
  Eye,
  Pencil,
  Send,
  Building2,
  BedDouble,
  Bath,
  DollarSign,
  Ruler,
  CalendarDays,
  MapPin,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────

interface PropertyWithShowings {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rent_price: number | null;
  square_feet: number | null;
  photos: string[] | null;
  section_8_accepted: boolean | null;
  pet_policy: string | null;
  amenities: string[] | null;
  status: string | null;
  unit_number: string | null;
  description: string | null;
  upcoming_showings: { id: string; scheduled_at: string; status: string }[];
}

// ── Email HTML renderer ───────────────────────────────────────────────

const PRIMARY = "#4F46E5";
const GOLD = "#ffb22c";

function renderFeaturedEmailHtml(
  properties: PropertyWithShowings[],
  orgName: string,
  senderDomain: string,
  headerText: string,
  introText: string,
  ctaText: string,
  footerText: string
): string {
  const propertyCardsHtml = properties
    .map((p) => {
      const photoUrl = p.photos?.[0];
      const showingDates = p.upcoming_showings
        .filter((s) => s.status === "confirmed" || s.status === "pending" || s.status === "scheduled")
        .slice(0, 2)
        .map((s) =>
          format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")
        );

      const details: string[] = [];
      if (p.bedrooms) details.push(`${p.bedrooms} Bed`);
      if (p.bathrooms) details.push(`${p.bathrooms} Bath`);
      if (p.square_feet) details.push(`${p.square_feet.toLocaleString()} sqft`);

      return `
        <div style="background:#ffffff;border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          ${
            photoUrl
              ? `<img src="${photoUrl}" alt="${p.address}" style="width:100%;height:200px;object-fit:cover;display:block;" />`
              : `<div style="width:100%;height:120px;background:linear-gradient(135deg,${PRIMARY} 0%,#6366F1 100%);display:flex;align-items:center;justify-content:center;">
                   <span style="color:#ffffff;font-size:32px;">🏠</span>
                 </div>`
          }
          <div style="padding:20px;">
            <h3 style="margin:0 0 4px;font-family:Montserrat,Arial,sans-serif;font-size:18px;font-weight:700;color:#1a1a1a;">
              ${p.address}${p.unit_number ? ` #${p.unit_number}` : ""}
            </h3>
            <p style="margin:0 0 12px;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#6b7280;">
              ${[p.city, p.state, p.zip_code].filter(Boolean).join(", ")}
            </p>

            <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">
              ${
                p.rent_price
                  ? `<span style="font-family:Montserrat,Arial,sans-serif;font-size:22px;font-weight:800;color:${PRIMARY};">$${p.rent_price.toLocaleString()}<span style="font-size:13px;font-weight:500;color:#6b7280;">/mo</span></span>`
                  : ""
              }
            </div>

            ${
              details.length > 0
                ? `<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
                     ${details
                       .map(
                         (d) =>
                           `<span style="background:#f3f4f6;color:#374151;font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;">${d}</span>`
                       )
                       .join("")}
                     ${
                       p.section_8_accepted
                         ? `<span style="background:#e8f5e9;color:#2e7d32;font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;">Section 8 OK</span>`
                         : ""
                     }
                     ${
                       p.pet_policy && p.pet_policy.toLowerCase() !== "no pets"
                         ? `<span style="background:#fef3c7;color:#92400e;font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;">🐾 ${p.pet_policy}</span>`
                         : ""
                     }
                   </div>`
                : ""
            }

            ${
              showingDates.length > 0
                ? `<div style="background:#EEF2FF;border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                     <p style="margin:0 0 4px;font-family:Montserrat,Arial,sans-serif;font-size:11px;font-weight:700;color:${PRIMARY};text-transform:uppercase;letter-spacing:0.05em;">Available Showings</p>
                     ${showingDates
                       .map(
                         (d) =>
                           `<p style="margin:2px 0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#374151;font-weight:500;">📅 ${d}</p>`
                       )
                       .join("")}
                   </div>`
                : ""
            }

            <div style="text-align:center;">
              <a href="https://${senderDomain}/p/schedule-showing/${p.id}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:8px;">
                ${ctaText}
              </a>
            </div>
          </div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${PRIMARY} 0%,#6366F1 100%);padding:36px 30px;text-align:center;">
            <h1 style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;">
              ${headerText}
            </h1>
            <p style="margin:10px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:${GOLD};font-weight:600;">
              ${orgName}
            </p>
            <div style="width:60px;height:3px;background:${GOLD};margin:16px auto 0;border-radius:2px;"></div>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:28px 30px 8px;">
            <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.7;color:#4b5563;">
              ${introText}
            </p>
          </td>
        </tr>

        <!-- Property Cards -->
        <tr>
          <td style="padding:16px 30px;">
            ${propertyCardsHtml}
          </td>
        </tr>

        <!-- Section 8 badge -->
        <tr>
          <td style="padding:0 30px 20px;text-align:center;">
            <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;font-family:Montserrat,Arial,sans-serif;font-size:13px;font-weight:600;padding:8px 18px;border-radius:20px;border:1px solid #c8e6c9;">
              Section 8 Vouchers Accepted
            </span>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 30px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#9ca3af;">${footerText}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────

const FeaturedPropertiesPage = () => {
  const { userRecord } = useAuth();
  const { getSetting } = useOrganizationSettings();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  // Editor state
  const [headerText, setHeaderText] = useState("This Weekend's Featured Properties");
  const [introText, setIntroText] = useState(
    "Don't miss these amazing rental homes available for showing this weekend. Schedule your free tour today — spots fill up fast!"
  );
  const [ctaText, setCtaText] = useState("Book a Tour");
  const [footerText, setFooterText] = useState(
    "Questions? Simply reply to this email or call us — we're here to help!"
  );
  const [subjectLine, setSubjectLine] = useState(
    "This Weekend's Open Showings — 3 Must-See Properties"
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch properties with upcoming showings this weekend
  const { data: propertiesWithShowings, isLoading } = useQuery({
    queryKey: ["featured-properties-weekend", orgId],
    queryFn: async () => {
      if (!orgId) return [];

      // Calculate this weekend's range (Saturday + Sunday) in Cleveland time
      const now = new Date();
      const clevelandNow = new Date(
        now.toLocaleString("en-US", { timeZone: "America/New_York" })
      );
      const dayOfWeek = clevelandNow.getDay(); // 0=Sun .. 6=Sat
      const daysUntilSaturday = dayOfWeek <= 6 ? (6 - dayOfWeek) % 7 : 0;
      const saturday = new Date(clevelandNow);
      saturday.setDate(clevelandNow.getDate() + (daysUntilSaturday === 0 && dayOfWeek !== 6 ? 7 : daysUntilSaturday));
      saturday.setHours(0, 0, 0, 0);
      const monday = new Date(saturday);
      monday.setDate(saturday.getDate() + 2);

      // Convert back to UTC for query
      const offset =
        now.getTime() -
        new Date(
          now.toLocaleString("en-US", { timeZone: "America/New_York" })
        ).getTime();
      const weekendStart = new Date(saturday.getTime() + offset).toISOString();
      const weekendEnd = new Date(monday.getTime() + offset).toISOString();

      // Fetch showings this weekend
      const { data: showings } = await supabase
        .from("showings")
        .select("id, property_id, scheduled_at, status")
        .eq("organization_id", orgId)
        .gte("scheduled_at", weekendStart)
        .lt("scheduled_at", weekendEnd)
        .in("status", ["confirmed", "pending", "scheduled"]);

      // Group showings by property
      const showingsByProperty: Record<
        string,
        { id: string; scheduled_at: string; status: string }[]
      > = {};
      for (const s of showings || []) {
        if (!s.property_id) continue;
        if (!showingsByProperty[s.property_id])
          showingsByProperty[s.property_id] = [];
        showingsByProperty[s.property_id].push({
          id: s.id,
          scheduled_at: s.scheduled_at,
          status: s.status,
        });
      }

      const propertyIds = Object.keys(showingsByProperty);

      // Also fetch all active properties so user can pick any
      const { data: allProperties } = await supabase
        .from("properties")
        .select(
          "id, address, city, state, zip_code, bedrooms, bathrooms, rent_price, square_feet, photos, section_8_accepted, pet_policy, amenities, status, unit_number, description"
        )
        .eq("organization_id", orgId)
        .in("status", ["available", "active", "coming_soon"])
        .order("rent_price", { ascending: true });

      const results: PropertyWithShowings[] = (allProperties || []).map(
        (p) => ({
          ...p,
          upcoming_showings: showingsByProperty[p.id] || [],
        })
      );

      // Sort: properties with weekend showings first, then by rent
      results.sort((a, b) => {
        const aHas = a.upcoming_showings.length > 0 ? 0 : 1;
        const bHas = b.upcoming_showings.length > 0 ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a.rent_price || 0) - (b.rent_price || 0);
      });

      // Auto-select first 3 with showings
      if (propertyIds.length > 0) {
        const autoSelect = results
          .filter((p) => p.upcoming_showings.length > 0)
          .slice(0, 3)
          .map((p) => p.id);
        setSelectedIds(new Set(autoSelect));
      }

      return results;
    },
    enabled: !!orgId,
  });

  const toggleProperty = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) {
          toast({
            title: "Maximum 3 properties",
            description: "Deselect one before adding another.",
            variant: "destructive",
          });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const selectedProperties = useMemo(
    () =>
      (propertiesWithShowings || []).filter((p) => selectedIds.has(p.id)),
    [propertiesWithShowings, selectedIds]
  );

  const orgName = getSetting<string>("org_name", "Home Guard Management") || "Home Guard Management";
  const senderDomain = getSetting<string>("sender_domain", "rentfindercleveland.com") || "rentfindercleveland.com";

  const previewHtml = useMemo(
    () =>
      renderFeaturedEmailHtml(
        selectedProperties,
        orgName,
        senderDomain,
        headerText,
        introText,
        ctaText,
        footerText
      ),
    [selectedProperties, orgName, senderDomain, headerText, introText, ctaText, footerText]
  );

  const handleSendTest = async () => {
    if (!userRecord?.email) {
      toast({ title: "No email", description: "Your account has no email.", variant: "destructive" });
      return;
    }
    if (selectedProperties.length === 0) {
      toast({ title: "No properties selected", description: "Select at least one property.", variant: "destructive" });
      return;
    }
    setIsSendingTest(true);
    try {
      await supabase.functions.invoke("send-notification-email", {
        body: {
          to: userRecord.email,
          subject: `[TEST] ${subjectLine}`,
          html: previewHtml,
          notification_type: "test",
          organization_id: orgId,
          queue: false,
        },
      });
      toast({ title: "Test sent", description: `Preview email sent to ${userRecord.email}` });
    } catch {
      toast({ title: "Send failed", variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(previewHtml);
    setCopied(true);
    toast({ title: "HTML copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-500" />
          Featured Properties Campaign
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Select up to 3 properties to highlight in a weekend showings email blast
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_600px] gap-6">
        {/* LEFT COLUMN: Property Selector + Editor */}
        <div className="space-y-6">
          {/* Property Selector */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Select Properties
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-auto text-xs",
                    selectedIds.size === 3
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-600"
                  )}
                >
                  {selectedIds.size}/3 selected
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-16 w-20 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-10 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : !propertiesWithShowings?.length ? (
                <EmptyState
                  icon={Building2}
                  title="No active properties"
                  description="Add properties to your inventory first"
                />
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {propertiesWithShowings.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    const hasShowings = p.upcoming_showings.length > 0;
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleProperty(p.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          isSelected
                            ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                        )}
                      >
                        {/* Thumbnail */}
                        <div className="h-14 w-20 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                          {p.photos?.[0] ? (
                            <img
                              src={p.photos[0]}
                              alt={p.address}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-indigo-100 to-indigo-50">
                              <Building2 className="h-5 w-5 text-indigo-300" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-slate-900 truncate">
                              {p.address}
                              {p.unit_number ? ` #${p.unit_number}` : ""}
                            </p>
                            {hasShowings && (
                              <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px] shrink-0">
                                <CalendarDays className="h-3 w-3 mr-0.5" />
                                {p.upcoming_showings.length} showing{p.upcoming_showings.length > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            {p.rent_price && (
                              <span className="flex items-center gap-0.5 font-medium text-slate-700">
                                <DollarSign className="h-3 w-3" />
                                {p.rent_price.toLocaleString()}/mo
                              </span>
                            )}
                            {p.bedrooms && (
                              <span className="flex items-center gap-0.5">
                                <BedDouble className="h-3 w-3" />
                                {p.bedrooms} bed
                              </span>
                            )}
                            {p.bathrooms && (
                              <span className="flex items-center gap-0.5">
                                <Bath className="h-3 w-3" />
                                {p.bathrooms} bath
                              </span>
                            )}
                            {p.square_feet && (
                              <span className="flex items-center gap-0.5">
                                <Ruler className="h-3 w-3" />
                                {p.square_feet.toLocaleString()} sqft
                              </span>
                            )}
                          </div>
                          {hasShowings && (
                            <div className="flex items-center gap-1 mt-1">
                              <CalendarDays className="h-3 w-3 text-indigo-500" />
                              <span className="text-[11px] text-indigo-600 font-medium">
                                {p.upcoming_showings
                                  .slice(0, 2)
                                  .map((s) =>
                                    format(new Date(s.scheduled_at), "EEE h:mm a")
                                  )
                                  .join(" · ")}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Toggle */}
                        <Switch
                          checked={isSelected}
                          onCheckedChange={() => toggleProperty(p.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Editor */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Email Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Subject Line</Label>
                <Input
                  value={subjectLine}
                  onChange={(e) => setSubjectLine(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Header Title</Label>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Intro Paragraph</Label>
                <Textarea
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Button Text</Label>
                  <Input
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Footer Text</Label>
                  <Input
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyHtml}
                  className="gap-1.5"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy HTML"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={isSendingTest || selectedProperties.length === 0}
                  className="gap-1.5"
                >
                  <Send
                    className={cn(
                      "h-3.5 w-3.5",
                      isSendingTest && "animate-pulse"
                    )}
                  />
                  {isSendingTest ? "Sending..." : "Send Test Email"}
                </Button>
                <Badge variant="outline" className="ml-auto text-xs text-slate-500">
                  {selectedProperties.length} propert{selectedProperties.length === 1 ? "y" : "ies"} in email
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Live Preview */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedProperties.length === 0 ? (
                <div className="border rounded-lg bg-slate-50 p-12">
                  <EmptyState
                    icon={Star}
                    title="No properties selected"
                    description="Toggle properties on the left to build your email"
                  />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-[#f3f4f6]">
                  <iframe
                    title="Featured Properties Email Preview"
                    srcDoc={previewHtml}
                    className="w-full border-0"
                    style={{ minHeight: 800 }}
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default FeaturedPropertiesPage;
