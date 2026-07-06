import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  SmsConsentCheckbox,
  buildConsentPayload,
  SMS_CONSENT_LANGUAGE,
} from "@/components/public/SmsConsentCheckbox";
import { CheckCircle2, Loader2, MessageCircleQuestion } from "lucide-react";

interface InquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyLabel?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InquiryDialog({ open, onOpenChange, propertyId, propertyLabel }: InquiryDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(() => localStorage.getItem("rf_name") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("rf_email") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("rf_phone") || "");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => { setMessage(""); setError(null); setSent(false); };

  const submit = async () => {
    setError(null);
    if (!message.trim()) { setError("Please write your question."); return; }
    if (!email.trim() && !phone.trim()) { setError("Add an email or phone so we can reply."); return; }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setError("Please enter a valid email address."); return; }

    setSending(true);
    // Persist contact details for the next form (same keys ScheduleShowing uses).
    localStorage.setItem("rf_name", name.trim());
    localStorage.setItem("rf_email", email.trim());
    if (phone.trim()) localStorage.setItem("rf_phone", phone.trim());

    const { data, error: fnErr } = await supabase.functions.invoke("submit-inquiry", {
      body: {
        full_name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        message: message.trim(),
        propertyId,
        propertyLabel,
        consent: consent && !!phone.trim(),
        consentText: consent && phone.trim() ? SMS_CONSENT_LANGUAGE : undefined,
        userAgent: buildConsentPayload(consent).user_agent,
      },
    });
    setSending(false);

    if (fnErr || (data && (data as any).error)) {
      setError((data as any)?.error || "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
    toast({ title: "Question sent", description: "Our local team will get back to you shortly." });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h3 className="mt-3 text-lg font-bold">Question sent!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Our local Cleveland team will reply {email.trim() ? "by email" : "by phone"} soon.
            </p>
            <Button className="mt-5 w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircleQuestion className="h-5 w-5 text-primary" /> Ask about this home
              </DialogTitle>
            </DialogHeader>
            {propertyLabel && (
              <p className="-mt-1 truncate text-sm text-muted-foreground">{propertyLabel}</p>
            )}
            <div className="space-y-3">
              <div>
                <Label htmlFor="inq-name" className="text-xs">Name</Label>
                <Input id="inq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="inq-email" className="text-xs">Email</Label>
                  <Input id="inq-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
                </div>
                <div>
                  <Label htmlFor="inq-phone" className="text-xs">Phone <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="inq-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(216) 555-0100" />
                </div>
              </div>
              <div>
                <Label htmlFor="inq-msg" className="text-xs">Your question</Label>
                <Textarea
                  id="inq-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. Is this still available? Do you accept my voucher amount?"
                />
              </div>
              {phone.trim() && (
                <SmsConsentCheckbox checked={consent} onCheckedChange={setConsent} compact />
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full font-semibold" onClick={submit} disabled={sending}>
                {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : "Send question"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">Consent is not required to apply for housing.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
