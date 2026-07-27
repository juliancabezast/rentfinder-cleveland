import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  Building2, Phone, Search, Mail, ClipboardList, CreditCard,
  BadgeDollarSign, Gauge, ShieldAlert, Gavel, ShieldCheck, Lock,
  PauseCircle, CheckCircle2, ArrowRight, Info, Scale,
} from "lucide-react";

// The live application portal (DoorLoop, TransUnion-powered). This page is the
// explainer that sits BEFORE the portal: it walks the applicant through the
// process, the TransUnion screening, the fee, and what happens after they
// apply, then hands off to PORTAL_URL via the fixed "Apply now" bar.
const PORTAL_URL =
  "https://homeguard.app.doorloop.com/tenant-portal/rental-applications/listing?source=CompanyLink";

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_E164 = "+14404444737";
const EMAIL = "support@rentfindercleveland.com";
const SCREENING_FEE = "$59.90";

const STEPS = [
  {
    icon: Search,
    title: "Find your property",
    body: "On the portal, search for the exact home you want to apply for and select its listing.",
  },
  {
    icon: Mail,
    title: "Enter your email",
    body: "Start with your email address — the portal uses it to create your secure application and save your progress.",
  },
  {
    icon: ClipboardList,
    title: "Complete your information",
    body: "Fill in your details: contact info, income, and household. Voucher holders can add their voucher details here.",
  },
  {
    icon: CreditCard,
    title: "Review, pay & submit",
    body: `Follow the remaining steps, pay the ${SCREENING_FEE} screening fee to TransUnion, and submit. That's it.`,
  },
];

const REPORTS = [
  { icon: BadgeDollarSign, title: "Income Verification", body: "Confirms your income and employment." },
  { icon: Gauge, title: "Credit report", body: "Your credit history from TransUnion." },
  { icon: ShieldAlert, title: "Criminal report", body: "A standard criminal-record check." },
  { icon: Gavel, title: "Eviction history", body: "Eviction-related court proceedings." },
];

export default function ApplyGuide() {
  useEffect(() => {
    document.title = "How to Apply | Rent Finder Cleveland";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-28 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Rent Finder Cleveland</span>
          </Link>
          <a href={`tel:${PHONE_E164}`} className="text-sm font-semibold text-foreground hover:text-primary">
            {PHONE_DISPLAY}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[hsl(239,84%,60%)] text-primary-foreground">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
            <Lock className="h-3.5 w-3.5" /> Secure application
          </span>
          <h1 className="mt-4 text-3xl md:text-4xl font-extrabold">How to apply</h1>
          <p className="mt-3 text-base opacity-95 max-w-xl mx-auto">
            Applying takes about 10–15 minutes and is handled securely by our screening
            partner, TransUnion. Here's exactly what to expect before you begin.
          </p>
        </div>
      </section>

      {/* Steps — a real sequence, so numbered */}
      <section className="max-w-3xl mx-auto px-5 py-10">
        <h2 className="text-xl font-bold text-foreground mb-5">The process, step by step</h2>
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <Card key={i} className="p-4 flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">STEP {i + 1}</span>
                  <h3 className="font-semibold text-foreground">{s.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Screening by TransUnion */}
      <section className="max-w-3xl mx-auto px-5 pb-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Screening is done by TransUnion</h2>
              <p className="text-sm text-muted-foreground mt-1">
                TransUnion — a nationwide screening company — runs and validates the reports
                below. Rent Finder Cleveland doesn't pull or store your credit data; TransUnion
                does the verification and shares the results with us to review.
              </p>
            </div>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {REPORTS.map((r) => (
              <div key={r.title} className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
                <r.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* Fee + what happens after */}
      <section className="max-w-3xl mx-auto px-5 py-8 grid md:grid-cols-2 gap-4">
        <Card className="p-5 border-primary/30 bg-primary/[0.04]">
          <div className="flex items-center gap-2 text-primary">
            <BadgeDollarSign className="h-5 w-5" />
            <h3 className="font-bold text-foreground">The fee is {SCREENING_FEE}</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            The {SCREENING_FEE} screening fee is <strong>paid directly to TransUnion</strong> when
            you apply — not to us. It's non-refundable and covers all four reports above.
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-primary">
            <PauseCircle className="h-5 w-5" />
            <h3 className="font-bold text-foreground">The unit goes on hold</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            As soon as your application is submitted, we place that unit <strong>on hold</strong> and
            pause new showings for it until a decision is made — so you're not competing with fresh
            tour traffic while your application is reviewed.
          </p>
        </Card>
      </section>

      {/* Before you apply + Fair Housing */}
      <section className="max-w-3xl mx-auto px-5 pb-10 space-y-4">
        <Card className="p-5 bg-muted/30">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Double-check your details before submitting</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Accurate income, ID, and contact information help TransUnion verify you quickly and
                avoid delays. Take a moment to review everything before you pay and submit.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Scale className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">Everyone's welcome here</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We're an Equal Housing Opportunity provider and follow the Fair Housing Act. Every
                application is reviewed by the same consistent criteria — we never make decisions
                based on race, color, religion, sex, national origin, familial status, or disability.
                Housing Choice Vouchers (Section 8) are welcome.
              </p>
              <p className="text-xs text-muted-foreground/80 mt-2 leading-relaxed">
                By applying you authorize TransUnion to run these reports. If an application is
                declined based on a report, you'll receive the notice needed to request a free copy
                and dispute any errors, as required by the Fair Credit Reporting Act.
              </p>
            </div>
          </div>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Questions first?{" "}
          <a href={`tel:${PHONE_E164}`} className="text-primary font-semibold hover:underline">
            Call {PHONE_DISPLAY}
          </a>{" "}
          or email{" "}
          <a href={`mailto:${EMAIL}`} className="text-primary font-semibold hover:underline">
            {EMAIL}
          </a>
          .
        </p>
      </section>

      {/* Fixed "Apply now" bar — the handoff to the portal */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <p className="hidden sm:block text-sm text-muted-foreground">
            Ready? You'll finish on our secure TransUnion portal.
          </p>
          <a
            href={PORTAL_URL}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-[15px] font-bold text-accent-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-100"
          >
            Apply now — click here
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
