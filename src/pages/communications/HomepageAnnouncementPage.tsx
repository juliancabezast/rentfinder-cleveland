import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  Megaphone,
  Eye,
  Pencil,
  Send,
  Users,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
  Rocket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  UNSUBSCRIBE_URL_PLACEHOLDER,
  DEFAULT_MARKETING_POSTAL_ADDRESS,
} from "@/lib/emailTemplateDefaults";
import {
  fetchSpotlightRecipients,
  sendSpotlightCampaign,
  DEFAULT_SPOTLIGHT_STATUSES,
  type SpotlightAudienceMode,
  type SendSpotlightResult,
} from "@/lib/spotlightCampaign";

// ── Email HTML renderer ───────────────────────────────────────────────
//
// A single "we relaunched our website" announcement. Unlike Property
// Spotlight this is not per-property — it showcases the new homepage and
// drives everyone to browse. The HTML is identical for every recipient
// (bulk send), carries the CAN-SPAM marketing footer with the
// {{unsubscribe_url}} placeholder, and reuses the same compliant queue
// pipeline as Spotlight (fetchSpotlightRecipients → sendSpotlightCampaign).

const PRIMARY = "#4F46E5";
const GOLD = "#ffb22c";

/** Minimal HTML escaping for values interpolated into the email. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value destined for an HTML attribute (adds quote handling). */
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

interface Feature {
  title: string;
  desc: string;
}

interface RenderOptions {
  /** Append the CAN-SPAM marketing footer (postal address + unsubscribe link). */
  marketing?: boolean;
  postalAddress?: string;
  /** Per-recipient unsubscribe URL. Omit for a real send so the
   *  {{unsubscribe_url}} placeholder survives for process-email-queue to fill. */
  unsubscribeUrl?: string;
}

interface AnnouncementContent {
  headerText: string;
  subheadline: string;
  introText: string;
  features: Feature[];
  ctaText: string;
  ctaUrl: string;
  footerText: string;
}

function renderAnnouncementEmailHtml(
  orgName: string,
  content: AnnouncementContent,
  opts: RenderOptions = {},
): string {
  const { headerText, subheadline, introText, features, ctaText, ctaUrl, footerText } =
    content;

  const featureRowsHtml = features
    .map(
      (f) => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr>
            <td width="30" valign="top" style="font-size:18px;line-height:1.4;">✅</td>
            <td style="font-family:Montserrat,Arial,sans-serif;">
              <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;">${esc(f.title)}</p>
              ${
                f.desc
                  ? `<p style="margin:3px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">${esc(f.desc)}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>`,
    )
    .join("");

  const safeUrl = escAttr(ctaUrl);

  // CAN-SPAM marketing footer: sender's physical postal address + a working
  // unsubscribe link. The {{unsubscribe_url}} placeholder is filled per-recipient
  // by process-email-queue at send time (real send passes no unsubscribeUrl).
  const unsub = opts.unsubscribeUrl || UNSUBSCRIBE_URL_PLACEHOLDER;
  const postal = (opts.postalAddress || DEFAULT_MARKETING_POSTAL_ADDRESS).trim();
  const marketingFooterHtml = opts.marketing
    ? `
        <p style="margin:14px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;">
          You are receiving this email because you inquired about a rental home with ${esc(orgName)}.
        </p>
        <p style="margin:6px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;">
          ${esc(postal)}
        </p>
        <p style="margin:6px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;">
          <a href="${unsub}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from marketing emails.
        </p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${PRIMARY} 0%,#6366F1 100%);padding:40px 30px;text-align:center;">
            <p style="margin:0 0 10px;font-family:Montserrat,Arial,sans-serif;font-size:12px;font-weight:700;color:${GOLD};text-transform:uppercase;letter-spacing:0.12em;">
              Just Launched
            </p>
            <h1 style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;line-height:1.25;">
              ${esc(headerText)}
            </h1>
            <p style="margin:12px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#e0e7ff;font-weight:600;">
              ${esc(subheadline)}
            </p>
            <div style="width:60px;height:3px;background:${GOLD};margin:18px auto 0;border-radius:2px;"></div>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:30px 34px 10px;">
            <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.7;color:#4b5563;">
              ${esc(introText)}
            </p>
          </td>
        </tr>

        <!-- Feature highlights -->
        <tr>
          <td style="padding:14px 34px 6px;">
            ${featureRowsHtml}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:14px 30px 26px;text-align:center;">
            <a href="${safeUrl}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-family:Montserrat,Arial,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:10px;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
              ${esc(ctaText)}
            </a>
          </td>
        </tr>

        <!-- Section 8 badge -->
        <tr>
          <td style="padding:0 30px 24px;text-align:center;">
            <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;font-family:Montserrat,Arial,sans-serif;font-size:13px;font-weight:600;padding:8px 18px;border-radius:20px;border:1px solid #c8e6c9;">
              Section 8 / Housing Choice Vouchers welcome on every home
            </span>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 30px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#9ca3af;">${esc(footerText)}</p>
            ${marketingFooterHtml}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Lead statuses offered as audience filter chips (dead-ends excluded).
const STATUS_CHIPS = [
  "new",
  "contacted",
  "engaged",
  "nurturing",
  "qualified",
  "showing_scheduled",
  "showed",
  "in_application",
];

const DEFAULT_FEATURES_TEXT = [
  "Browse every available home | See all our Cleveland rentals in one place, with photos, pricing, and full details.",
  "Filter by what matters | Set your price range, bedrooms, and ZIP code and see only the homes that fit.",
  "Section 8 welcome — always | Every home accepts Housing Choice Vouchers and is inspection-ready.",
  "See homes before they list | Preview \"coming soon\" homes so you can get first pick.",
  "Apply online in minutes | Found the one? Start your application right from the listing.",
].join("\n");

// ── Component ─────────────────────────────────────────────────────────

const HomepageAnnouncementPage = () => {
  const { userRecord } = useAuth();
  const { getSetting } = useOrganizationSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const orgId = userRecord?.organization_id;

  const orgName =
    (getSetting as any)("org_name", "Rent Finder Cleveland") || "Rent Finder Cleveland";
  const senderDomain =
    (getSetting as any)("sender_domain", "rentfindercleveland.com") ||
    "rentfindercleveland.com";

  // Editor state
  const [subjectLine, setSubjectLine] = useState(
    "We rebuilt our website — find your next Cleveland home faster",
  );
  const [headerText, setHeaderText] = useState("A Brand-New Way to Find Your Home");
  const [subheadline, setSubheadline] = useState(orgName);
  const [introText, setIntroText] = useState(
    "We just relaunched our website to make finding your next rental in Cleveland easier than ever — every available home in one place, filters that actually work, and Housing Choice Vouchers welcome on every single home.",
  );
  const [featuresText, setFeaturesText] = useState(DEFAULT_FEATURES_TEXT);
  const [ctaText, setCtaText] = useState("Browse Homes");
  const [ctaUrl, setCtaUrl] = useState(`https://${senderDomain}/`);
  const [footerText, setFooterText] = useState(
    "Questions? Just reply to this email or call (440) 444-4737 — we're here to help.",
  );

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [copied, setCopied] = useState(false);

  // Audience + send state
  const [audienceMode, setAudienceMode] = useState<SpotlightAudienceMode>("all_active");
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_SPOTLIGHT_STATUSES);
  const [campaignName, setCampaignName] = useState(
    `New Homepage Announcement — ${new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendSpotlightResult | null>(null);

  const toggleStatus = (s: string) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Parse the "Title | description" textarea into feature rows.
  const features = useMemo<Feature[]>(
    () =>
      featuresText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf("|");
          if (idx === -1) return { title: line, desc: "" };
          return { title: line.slice(0, idx).trim(), desc: line.slice(idx + 1).trim() };
        }),
    [featuresText],
  );

  // Org postal address for the CAN-SPAM footer (composed like Property Spotlight).
  const { data: orgAddr } = useQuery({
    queryKey: ["announcement-org-postal", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("organizations")
        .select("address, city, state, zip_code")
        .eq("id", orgId)
        .maybeSingle();
      return data as {
        address: string | null;
        city: string | null;
        state: string | null;
        zip_code: string | null;
      } | null;
    },
    enabled: !!orgId,
  });

  const postalAddress = orgAddr?.address
    ? [
        orgName,
        orgAddr.address,
        [[orgAddr.city, orgAddr.state].filter(Boolean).join(", "), orgAddr.zip_code]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;

  const content = useMemo<AnnouncementContent>(
    () => ({
      headerText,
      subheadline,
      introText,
      features,
      ctaText,
      ctaUrl,
      footerText,
    }),
    [headerText, subheadline, introText, features, ctaText, ctaUrl, footerText],
  );

  // Preview shows the marketing footer with a live link (real send keeps the placeholder).
  const previewHtml = useMemo(
    () =>
      renderAnnouncementEmailHtml(orgName, content, {
        marketing: true,
        postalAddress,
        unsubscribeUrl: "#",
      }),
    [orgName, content, postalAddress],
  );

  // Live recipient count (pre-consent-suppression upper bound).
  const { data: recipientCount = 0, isFetching: countLoading } = useQuery({
    queryKey: [
      "announcement-audience-count",
      orgId,
      audienceMode,
      audienceMode === "by_status" ? [...statuses].sort().join(",") : "",
    ],
    queryFn: async () => {
      if (!orgId) return 0;
      const recips = await fetchSpotlightRecipients(supabase, orgId, audienceMode, {
        statuses,
      });
      return recips.length;
    },
    enabled: !!orgId,
  });

  const audienceLabelText =
    audienceMode === "by_status"
      ? `Leads with status: ${statuses.join(", ") || "(none selected)"}`
      : "All active leads";

  const canSend = recipientCount > 0 && !isSending && !!orgId;

  const handleSendTest = async () => {
    if (!userRecord?.email) {
      toast({
        title: "No email",
        description: "Your account has no email.",
        variant: "destructive",
      });
      return;
    }
    setIsSendingTest(true);
    try {
      await supabase.functions.invoke("send-notification-email", {
        body: {
          to: userRecord.email,
          subject: `[TEST] ${subjectLine}`,
          html: renderAnnouncementEmailHtml(orgName, content, {
            marketing: true,
            postalAddress,
            unsubscribeUrl: "#",
          }),
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
    navigator.clipboard.writeText(
      renderAnnouncementEmailHtml(orgName, content, {
        marketing: true,
        postalAddress,
        unsubscribeUrl: "#",
      }),
    );
    setCopied(true);
    toast({ title: "HTML copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmSend = async () => {
    setConfirmOpen(false);
    if (!orgId) return;
    setIsSending(true);
    setSendResult(null);
    try {
      // Re-fetch a fresh recipient pool at send time.
      const recipients = await fetchSpotlightRecipients(supabase, orgId, audienceMode, {
        statuses,
      });
      if (recipients.length === 0) {
        toast({
          title: "No recipients",
          description: "No leads match this audience.",
          variant: "destructive",
        });
        return;
      }
      // Real send: keep the {{unsubscribe_url}} placeholder (no unsubscribeUrl)
      // so process-email-queue signs a per-recipient URL server-side.
      const sendHtml = renderAnnouncementEmailHtml(orgName, content, {
        marketing: true,
        postalAddress,
      });
      const result = await sendSpotlightCampaign({
        supabase,
        orgId,
        orgName,
        createdBy: userRecord?.id,
        campaignName,
        subject: subjectLine,
        html: sendHtml,
        recipients,
        propertyIds: [],
        audienceLabel: audienceLabelText,
      });
      setSendResult(result);
      toast({
        title: "Announcement queued 🎉",
        description: `${result.queued} email${result.queued === 1 ? "" : "s"} queued${
          result.suppressed > 0
            ? `, ${result.suppressed} skipped (unsubscribed / no consent)`
            : ""
        }.`,
      });
    } catch (err) {
      console.error("Announcement send failed:", err);
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Rocket className="h-6 w-6 text-[#4F46E5]" />
          New Homepage Announcement
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Introduce the redesigned website to your leads and drive them to browse — sent as a
          compliant, consent-checked email blast
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_600px] gap-6">
        {/* LEFT COLUMN: Editor + Audience */}
        <div className="space-y-6">
          {/* Email Editor */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                1. Email Content
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Header Title</Label>
                  <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Subheadline</Label>
                  <Input value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Intro Paragraph</Label>
                <Textarea
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Feature Highlights</Label>
                <Textarea
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400">
                  One per line. Use <span className="font-mono">Title | description</span> — the
                  part before the “|” is bold.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Button Text</Label>
                  <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Button URL</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Footer Text</Label>
                <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} />
              </div>

              {/* Composer actions (test / copy) */}
              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={handleCopyHtml} className="gap-1.5">
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
                  disabled={isSendingTest}
                  className="gap-1.5"
                >
                  <Send className={cn("h-3.5 w-3.5", isSendingTest && "animate-pulse")} />
                  {isSendingTest ? "Sending..." : "Send Test to Myself"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Audience + Send */}
          <Card variant="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                2. Audience &amp; Send
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="New Homepage Announcement..."
                />
                <p className="text-[11px] text-slate-400">
                  Shown in Campaigns for tracking. Not visible to recipients.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Who receives this?</Label>
                <RadioGroup
                  value={audienceMode}
                  onValueChange={(v) => setAudienceMode(v as SpotlightAudienceMode)}
                  className="space-y-2"
                >
                  <label
                    htmlFor="aud-all"
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      audienceMode === "all_active"
                        ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                        : "border-slate-200 hover:bg-slate-50/50",
                    )}
                  >
                    <RadioGroupItem value="all_active" id="aud-all" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">All leads</p>
                      <p className="text-xs text-slate-500">
                        Everyone with an email, excluding lost / converted. Recommended for a
                        site-launch announcement.
                      </p>
                    </div>
                  </label>

                  <label
                    htmlFor="aud-status"
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      audienceMode === "by_status"
                        ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                        : "border-slate-200 hover:bg-slate-50/50",
                    )}
                  >
                    <RadioGroupItem value="by_status" id="aud-status" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">By lead status</p>
                      <p className="text-xs text-slate-500 mb-2">
                        Pick which pipeline stages to include.
                      </p>
                      {audienceMode === "by_status" && (
                        <div
                          className="flex flex-wrap gap-1.5"
                          onClick={(e) => e.preventDefault()}
                        >
                          {STATUS_CHIPS.map((s) => {
                            const on = statuses.includes(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => toggleStatus(s)}
                                className={cn(
                                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                                  on
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300",
                                )}
                              >
                                {s.replace(/_/g, " ")}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Recipient count + compliance note */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-indigo-600" />
                  <span className="font-semibold text-slate-900">
                    {countLoading ? "…" : recipientCount.toLocaleString()}
                  </span>
                  <span className="text-slate-600">
                    lead{recipientCount === 1 ? "" : "s"} with email match this audience
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 mt-px shrink-0" />
                  <span>
                    Unsubscribed, no-marketing-consent, and do-not-contact leads are skipped
                    automatically. Each email includes a one-click unsubscribe (CAN-SPAM).
                  </span>
                </div>
              </div>

              {/* Send result */}
              {sendResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Queued {sendResult.queued} email{sendResult.queued === 1 ? "" : "s"}
                    {sendResult.suppressed > 0 ? ` · ${sendResult.suppressed} skipped` : ""}
                  </div>
                  <p className="text-xs text-emerald-700 mt-1">
                    They send in the background (rate-limited). Track delivery in Campaigns.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5"
                    onClick={() => navigate("/campaigns")}
                  >
                    View in Campaigns
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Send button */}
              <Button
                className="w-full gap-2"
                disabled={!canSend}
                onClick={() => setConfirmOpen(true)}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isSending
                  ? "Queuing…"
                  : `Send announcement to ${
                      countLoading ? "…" : recipientCount.toLocaleString()
                    } lead${recipientCount === 1 ? "" : "s"}`}
              </Button>
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
              <div className="border rounded-lg overflow-hidden bg-[#f3f4f6]">
                <iframe
                  title="Homepage Announcement Email Preview"
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ minHeight: 800 }}
                  sandbox="allow-same-origin"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send this announcement to ~{recipientCount.toLocaleString()} lead
              {recipientCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The new-homepage announcement will be emailed to:{" "}
              <span className="font-medium text-slate-700">{audienceLabelText}</span>.
              <br />
              Unsubscribed, no-consent, and do-not-contact leads are skipped automatically, so the
              final count may be lower. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSend}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HomepageAnnouncementPage;
