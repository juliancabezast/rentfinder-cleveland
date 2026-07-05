import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SmsConsentCheckbox, buildConsentPayload,
} from "@/components/public/SmsConsentCheckbox";
import {
  Loader2, ArrowRight, ArrowLeft, CheckCircle2, User, Mail, CalendarDays,
  ShieldCheck, FileSignature, Home as HomeIcon,
} from "lucide-react";

/** Version of the fee / privacy acknowledgment text, logged with the consent. */
export const APP_CONSENT_VERSION = "1.0";

/** The exact text the applicant acknowledges — stored verbatim as consent evidence. */
const FEE_ACK_TEXT =
  "I understand that submitting this form does NOT reserve a home and is NOT a formal application. " +
  "A formal application requires a $50 non-refundable application fee per household. I authorize Rent " +
  "Finder Cleveland to contact me about my application, and I agree to the Privacy Policy and Terms of Service.";

const HOUSEHOLD_OPTIONS = ["1", "2", "3", "4", "5", "6+"];

interface ApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Property the applicant is applying for (from the listing card). */
  propertyId: string;
  /** Human label for confirmation/telegram (e.g. "1425 E 55th St, Cleveland"). */
  propertyLabel?: string;
  /** Coming-soon home: shows the "Coming Soon · Section 8 Application" tag
   *  and flags the submission so the team knows it's a pre-availability apply. */
  comingSoon?: boolean;
}

type Voucher = "" | "yes" | "no";

const STEP_TITLES = [
  "Let's start your application",
  "How can we reach you?",
  "A few details",
  "Review & confirm",
];

export function ApplicationDialog({
  open, onOpenChange, propertyId, propertyLabel, comingSoon,
}: ApplicationDialogProps) {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields (prefill from a prior showing/application on this device)
  const [fullName, setFullName] = useState(() => localStorage.getItem("rf_name") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("rf_phone") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("rf_email") || "");
  const [voucher, setVoucher] = useState<Voucher>("");
  const [housingAuthority, setHousingAuthority] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [household, setHousehold] = useState("");
  const [feeAck, setFeeAck] = useState(false);
  const [feeAckError, setFeeAckError] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  // Reset transient state when the dialog reopens for a fresh property
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setFeeAckError(false);
      // Keep leadId/fields so a returning applicant continues where they left off,
      // but a new property should re-collect from step 1.
    }
  }, [open, propertyId]);

  const phoneDigits = phone.replace(/\D/g, "");
  const isPhoneValid = phoneDigits.length === 10;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    if (raw.length >= 7) setPhone(`(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`);
    else if (raw.length >= 4) setPhone(`(${raw.slice(0, 3)}) ${raw.slice(3)}`);
    else setPhone(raw);
  };

  /** Build the payload of everything gathered so far. Server only applies
   * provided, non-empty fields and never blanks out existing data. */
  function basePayload() {
    return {
      action: "save",
      lead_id: leadId || undefined,
      property_id: propertyId || undefined,
      full_name: fullName.trim() || undefined,
      phone: phone || undefined,
      email: email.trim() || undefined,
      has_voucher: voucher === "" ? undefined : voucher === "yes",
      coming_soon: comingSoon || undefined,
      housing_authority: voucher === "yes" && housingAuthority.trim() ? housingAuthority.trim() : undefined,
      move_in_date: moveInDate || undefined,
      household_size: household ? parseInt(household, 10) : undefined,
    };
  }

  async function persist(stepNum: number, final = false): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...basePayload(), step: stepNum, final };
      if (final) {
        payload.consent = smsConsent ? buildConsentPayload(true) : undefined;
        payload.fee_ack = {
          version: APP_CONSENT_VERSION,
          source_url: window.location.href,
          text: FEE_ACK_TEXT,
        };
        payload.user_agent = navigator.userAgent;
      }
      const { data, error: fnErr } = await supabase.functions.invoke("submit-application", {
        body: payload,
      });
      if (fnErr) {
        let msg = "Something went wrong. Please try again or call (440) 444-4737.";
        try {
          const ctx = (fnErr as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const b = await ctx.json();
            if (b?.error) msg = b.error;
          }
        } catch { /* ignore */ }
        setError(msg);
        return false;
      }
      if (data?.error) { setError(data.error); return false; }
      if (data?.lead_id) {
        setLeadId(data.lead_id);
        try { sessionStorage.setItem("rf_app_lead", data.lead_id); } catch { /* ignore */ }
      }
      // Remember contact info for next time (shared with the showing flow)
      try {
        if (fullName.trim()) localStorage.setItem("rf_name", fullName.trim());
        if (phone) localStorage.setItem("rf_phone", phone);
        if (email.trim()) localStorage.setItem("rf_email", email.trim());
      } catch { /* ignore */ }
      return true;
    } catch (e) {
      console.error("submit-application invoke error:", e);
      setError("Something went wrong. Please try again or call (440) 444-4737.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    if (step === 1) {
      if (!fullName.trim() || !isPhoneValid) {
        setError("Please enter your full name and a valid 10-digit phone number.");
        return;
      }
      if (await persist(1)) setStep(2);
    } else if (step === 2) {
      if (!isEmailValid) { setError("Please enter a valid email address."); return; }
      if (voucher === "") { setError("Please tell us whether you have a housing voucher."); return; }
      if (await persist(2)) setStep(3);
    } else if (step === 3) {
      if (!moveInDate) { setError("Please choose your desired move-in date."); return; }
      if (await persist(3)) setStep(4);
    }
  }

  async function handleSubmit() {
    if (!feeAck) { setFeeAckError(true); return; }
    setFeeAckError(false);
    const ok = await persist(4, true);
    if (ok) {
      onOpenChange(false);
      navigate("/apply/started", {
        state: { leadId, propertyLabel, propertyId },
      });
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 sm:p-0 gap-0 overflow-hidden sm:rounded-2xl border-0 shadow-2xl">
        {/* Header — brand gradient with a soft glow + segmented progress.
            Rounded to match the dialog container so no white rim peeks out. */}
        <div className="relative overflow-hidden rounded-t-lg sm:rounded-t-2xl bg-gradient-to-br from-primary to-[hsl(239,84%,60%)] text-primary-foreground px-6 pt-6 pb-6">
          <div
            className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(255,178,44,0.55) 0%, transparent 70%)" }}
            aria-hidden="true"
          />
          <DialogHeader className="relative space-y-2 text-left">
            {comingSoon && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-950 shadow-sm">
                Coming Soon · Section 8 Application
              </span>
            )}
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
              Step {step} of 4
            </p>
            <DialogTitle className="text-[22px] leading-tight font-extrabold text-primary-foreground">
              {STEP_TITLES[step - 1]}
            </DialogTitle>
          </DialogHeader>
          {propertyLabel && (
            <div className="relative mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[13px] font-medium text-primary-foreground/95 backdrop-blur-sm">
              <HomeIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="truncate">{propertyLabel}</span>
            </div>
          )}
          {/* Segmented progress — completed steps turn green, the current one
              pulses ("in progress"), upcoming stay dim */}
          <div className="relative mt-5 flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  i < step
                    ? "bg-emerald-400"
                    : i === step
                      ? "bg-emerald-300 animate-pulse"
                      : "bg-primary-foreground/20"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="min-h-[224px]">
          {/* STEP 1 — name + phone */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Just your name and phone to begin — it takes under a minute, and we'll save your
                progress as you go.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="app-name" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Full name
                </Label>
                <Input className="h-11 rounded-xl" id="app-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe" autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="app-phone">Phone number</Label>
                <Input className="h-11 rounded-xl" id="app-phone" value={phone} onChange={handlePhoneChange}
                  placeholder="(216) 555-0142" inputMode="tel" autoComplete="tel" />
              </div>
            </div>
          )}

          {/* STEP 2 — email + voucher */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="app-email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Email address
                </Label>
                <Input className="h-11 rounded-xl" id="app-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com" autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Do you have a housing voucher (Section 8)?
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["yes", "no"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setVoucher(v)}
                      className={`h-11 rounded-xl border text-sm font-semibold transition-all ${
                        voucher === v
                          ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/25"
                          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}>
                      {v === "yes" ? "Yes, I have a voucher" : "No"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Every home on this site welcomes Housing Choice Vouchers — this just helps us prepare.
                </p>
                {voucher === "yes" && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="app-authority" className="text-xs">Housing authority (optional)</Label>
                    <Input className="h-11 rounded-xl" id="app-authority" value={housingAuthority}
                      onChange={(e) => setHousingAuthority(e.target.value)}
                      placeholder="e.g. CMHA" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3 — move-in + household */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="app-movein" className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> Desired move-in date
                </Label>
                <Input className="h-11 rounded-xl" id="app-movein" type="date" min={todayStr} value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>How many people will live in the home?</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {HOUSEHOLD_OPTIONS.map((h) => (
                    <button key={h} type="button" onClick={() => setHousehold(h)}
                      className={`h-11 rounded-xl border text-sm font-semibold transition-all ${
                        household === h
                          ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/25"
                          : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}>
                      {h}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Optional — helps us match you to the right size home.</p>
              </div>
            </div>
          )}

          {/* STEP 4 — review + consent */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-1 text-sm divide-y divide-border/60 [&>div]:py-2.5">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Name</span><span className="font-medium text-right">{fullName || "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Phone</span><span className="font-medium text-right">{phone || "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Email</span><span className="font-medium text-right break-all">{email || "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Voucher</span><span className="font-medium text-right">{voucher === "yes" ? "Yes" : voucher === "no" ? "No" : "—"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Move-in</span><span className="font-medium text-right">{moveInDate || "—"}</span></div>
              </div>

              <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${feeAckError ? "border-destructive bg-destructive/5" : "border-border"}`}>
                <Checkbox id="fee-ack" checked={feeAck}
                  onCheckedChange={(v) => { setFeeAck(v as boolean); setFeeAckError(false); }}
                  className="mt-0.5" />
                <label htmlFor="fee-ack" className={`text-xs leading-snug cursor-pointer select-none ${feeAckError ? "text-destructive" : "text-muted-foreground"}`}>
                  I understand this is <strong>not a formal application</strong> and does not reserve a home.
                  A formal application requires a <strong>$50 non-refundable application fee per household</strong>.
                  I agree to the{" "}
                  <a href="/p/privacy-policy" target="_blank" rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>{" "}
                  and{" "}
                  <a href="/p/terms-of-service" target="_blank" rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline" onClick={(e) => e.stopPropagation()}>Terms of Service</a>.
                </label>
              </div>

              <SmsConsentCheckbox checked={smsConsent} onCheckedChange={setSmsConsent} compact />
            </div>
          )}

          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-1">
            {step > 1 && (
              <Button
                variant="outline"
                className="h-11 rounded-xl px-4"
                onClick={() => { setError(null); setStep(step - 1); }}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
              </Button>
            )}
            {step < 4 ? (
              <Button className="flex-1 h-11 rounded-xl text-[15px] font-semibold" onClick={handleNext} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Continue <ArrowRight className="h-4 w-4 ml-1.5" /></>)}
              </Button>
            ) : (
              <Button className="flex-1 h-11 rounded-xl text-[15px] font-semibold" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><FileSignature className="h-4 w-4 mr-1.5" /> Submit application</>)}
              </Button>
            )}
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Your progress saves automatically at each step.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
