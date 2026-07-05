import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2 } from "lucide-react";

interface BusinessLeadFormProps {
  leadType: "housing_partner" | "corporate_leasing";
  /** Where the form lives, for attribution (e.g. "footer", article slug). */
  source?: string;
  /** Accent for the submit button (defaults to primary). */
  variant?: "primary" | "accent";
}

/** Short name / email / phone capture → submit-business-lead → Business tab. */
export function BusinessLeadForm({ leadType, source = "footer", variant = "primary" }: BusinessLeadFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState(""); // honeypot ("company_website")
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !emailValid) {
      setError("Please enter your name and a valid email.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("submit-business-lead", {
        body: {
          lead_type: leadType,
          full_name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          source,
          source_detail: typeof window !== "undefined" ? window.location.pathname : undefined,
          company_website: company, // honeypot — real users leave blank
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        },
      });
      if (fnErr || data?.error) {
        setError(data?.error || "Something went wrong. Please email support@rentfindercleveland.com.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please email support@rentfindercleveland.com.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-white/10 border border-white/15 p-3 text-sm text-white">
        <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <span>Thanks — we've got your details and our team will reach out shortly.</span>
      </div>
    );
  }

  const btnCls =
    variant === "accent"
      ? "bg-accent text-accent-foreground hover:opacity-90"
      : "bg-primary text-primary-foreground hover:opacity-90";

  return (
    <form onSubmit={submit} className="space-y-2">
      {/* Honeypot (hidden from users) */}
      <input
        type="text" tabIndex={-1} autoComplete="off"
        value={company} onChange={(e) => setCompany(e.target.value)}
        className="hidden" aria-hidden="true"
      />
      <Input
        value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="bg-white/95 text-foreground placeholder:text-muted-foreground border-0 h-9"
      />
      <Input
        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="Work email"
        className="bg-white/95 text-foreground placeholder:text-muted-foreground border-0 h-9"
      />
      <Input
        type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="bg-white/95 text-foreground placeholder:text-muted-foreground border-0 h-9"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <Button type="submit" disabled={submitting} className={`w-full h-9 ${btnCls}`}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get in touch"}
      </Button>
    </form>
  );
}
