import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, CheckCircle2, Phone, Sparkles, IdCard, FileText, DollarSign,
  PhoneCall, ClipboardCheck, ArrowRight, Home as HomeIcon, Loader2,
} from "lucide-react";

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_E164 = "+14404444737";
const EMAIL = "support@rentfindercleveland.com";

/* ── Optional enrichment quiz ────────────────────────────────────────────────
 * Each question saves the moment it's answered (submit-application `quiz`).
 * All questions are legitimate rental-matching criteria — no protected-class or
 * familial-status questions (Fair Housing).                                    */
interface QuizOption { label: string; value: Record<string, unknown>; }
interface QuizQuestion {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  question: string;
  multi?: boolean;
  options: QuizOption[];
}

const QUIZ: QuizQuestion[] = [
  {
    key: "budget", icon: DollarSign,
    question: "What monthly rent are you comfortable with?",
    options: [
      { label: "Up to $800", value: { budget_max: 800 } },
      { label: "$800–$1,000", value: { budget_min: 800, budget_max: 1000 } },
      { label: "$1,000–$1,300", value: { budget_min: 1000, budget_max: 1300 } },
      { label: "$1,300–$1,600", value: { budget_min: 1300, budget_max: 1600 } },
      { label: "$1,600+", value: { budget_min: 1600 } },
    ],
  },
  {
    key: "household", icon: HomeIcon,
    question: "How many people will live in the home?",
    options: ["1", "2", "3", "4", "5", "6+"].map((n) => ({
      label: n, value: { household_size: parseInt(n, 10) },
    })),
  },
  {
    key: "types", icon: Building2, multi: true,
    question: "Which home types are you open to?",
    options: [
      { label: "Single-family", value: { _t: "Single-family" } },
      { label: "Multi-family", value: { _t: "Multi-family" } },
      { label: "Either", value: { _t: "Either" } },
    ],
  },
  {
    key: "urgency", icon: ClipboardCheck,
    question: "How soon do you need to move?",
    options: [
      { label: "ASAP", value: { move_urgency: "ASAP" } },
      { label: "Within 30 days", value: { move_urgency: "Within 30 days" } },
      { label: "30–60 days", value: { move_urgency: "30-60 days" } },
      { label: "Flexible", value: { move_urgency: "Flexible" } },
    ],
  },
  {
    key: "income", icon: DollarSign,
    question: "What's your primary source of income?",
    options: [
      { label: "Employment", value: { income_source: "Employment" } },
      { label: "Self-employed", value: { income_source: "Self-employed" } },
      { label: "Housing voucher", value: { income_source: "Housing voucher" } },
      { label: "Other", value: { income_source: "Other" } },
    ],
  },
  {
    key: "pets", icon: Sparkles,
    question: "Any pets?",
    options: [
      { label: "No pets", value: { pets: "None" } },
      { label: "Yes", value: { pets: "Yes" } },
    ],
  },
];

export default function ApplicationStarted() {
  const location = useLocation();
  const state = (location.state || {}) as { leadId?: string; propertyLabel?: string };

  const leadId = useMemo(
    () => state.leadId || (() => { try { return sessionStorage.getItem("rf_app_lead"); } catch { return null; } })(),
    [state.leadId],
  );

  useEffect(() => {
    document.title = "Application Started | Rent Finder Cleveland";
  }, []);

  // Per-question UI state
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});

  async function saveAnswer(q: QuizQuestion, opt: QuizOption) {
    if (!leadId) return;

    // Compute the new selection for this question
    let nextSelected: string[];
    let answers: Record<string, unknown>;
    if (q.multi) {
      const cur = new Set(selected[q.key] || []);
      if (cur.has(opt.label)) cur.delete(opt.label); else cur.add(opt.label);
      nextSelected = [...cur];
      answers = { property_types: nextSelected };
    } else {
      nextSelected = [opt.label];
      answers = { ...opt.value };
    }
    setSelected((s) => ({ ...s, [q.key]: nextSelected }));

    setSavingKey(q.key);
    try {
      const { error } = await supabase.functions.invoke("submit-application", {
        body: { action: "quiz", lead_id: leadId, answers },
      });
      if (!error) setSavedKeys((k) => ({ ...k, [q.key]: true }));
    } catch (e) {
      console.error("quiz save error:", e);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
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

      {/* Hero — success */}
      <section className="bg-gradient-to-br from-primary to-[hsl(239,84%,60%)] text-primary-foreground">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <div className="w-16 h-16 rounded-full bg-primary-foreground/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-9 w-9 text-accent" />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold">You're on our list!</h1>
          <p className="mt-3 text-base opacity-95 max-w-xl mx-auto">
            Thanks — we've saved your information{state.propertyLabel ? <> for <strong>{state.propertyLabel}</strong></> : null}.
            A member of our local leasing team will reach out to help you finish your application.
          </p>
          <Badge className="mt-4 bg-accent text-accent-foreground">This is not a formal application yet</Badge>
        </div>
      </section>

      {/* What happens next */}
      <section className="max-w-3xl mx-auto px-5 py-10">
        <h2 className="text-xl font-bold text-foreground mb-5">What happens next</h2>
        <div className="space-y-4">
          {[
            { icon: PhoneCall, title: "We'll contact you", body: "A real person from our Cleveland team will call or text you to walk through the next steps and answer any questions." },
            { icon: DollarSign, title: "Formalize with the $50 application fee", body: "Your application becomes formal once the $50 non-refundable application fee (per household) is paid. We'll explain exactly how — you don't pay anything here." },
            { icon: FileText, title: "Have your documents ready", body: "To verify income we'll ask for a photo ID and your last 3 pay stubs. Income generally needs to be about 3× the monthly rent. Voucher holders: have your voucher details handy instead." },
          ].map((s, i) => (
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

        {/* Documents checklist */}
        <Card className="mt-6 p-5 bg-muted/30">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Get a head start — have these ready
          </h3>
          <ul className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
            <li className="flex items-center gap-2"><IdCard className="h-4 w-4 text-primary shrink-0" /> Photo ID</li>
            <li className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary shrink-0" /> Last 3 pay stubs</li>
            <li className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary shrink-0" /> Income ≈ 3× the rent</li>
          </ul>
        </Card>
      </section>

      {/* Optional enrichment quiz */}
      {leadId && (
        <section className="max-w-3xl mx-auto px-5 pb-12">
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-accent mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-foreground">Help us match you faster <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Answer as many or as few as you like — every answer saves instantly and helps our team find the right home for you.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {QUIZ.map((q) => {
                const sel = selected[q.key] || [];
                return (
                  <div key={q.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <q.icon className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm text-foreground">{q.question}</span>
                      {savingKey === q.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {savingKey !== q.key && savedKeys[q.key] && (
                        <span className="text-xs text-primary inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((opt) => {
                        const active = sel.includes(opt.label);
                        return (
                          <button key={opt.label} type="button" onClick={() => saveAnswer(q, opt)}
                            className={`px-3.5 h-9 rounded-full border text-sm font-medium transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-foreground border-border hover:border-primary"
                            }`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-5 pb-16 text-center">
        <div className="flex gap-3 justify-center flex-wrap">
          <Button asChild size="lg" variant="outline">
            <Link to="/#listings">Keep browsing homes <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
          </Button>
          <Button asChild size="lg">
            <a href={`tel:${PHONE_E164}`}><Phone className="h-4 w-4 mr-2" /> Call {PHONE_DISPLAY}</a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[hsl(222,47%,11%)] text-slate-300">
        <div className="max-w-3xl mx-auto px-5 py-8 text-center text-xs text-slate-500 leading-relaxed">
          <p className="mb-2">
            <a href={`tel:${PHONE_E164}`} className="text-accent">{PHONE_DISPLAY}</a>
            {" · "}
            <a href={`mailto:${EMAIL}`} className="text-accent">{EMAIL}</a>
          </p>
          © {new Date().getFullYear()} Rent Finder Cleveland, LLC. Equal housing opportunity provider,
          in accordance with the Fair Housing Act. Cleveland, Ohio.
        </div>
      </footer>
    </div>
  );
}
