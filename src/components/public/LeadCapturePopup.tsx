import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Phone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LeadCapturePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyAddress?: string;
  organizationId: string;
  source?: string;
}

// US phone validation regex
const US_PHONE_REGEX = /^(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

// Format phone to digits only for storage
const formatPhoneForStorage = (phone: string): string => {
  return phone.replace(/\D/g, "").replace(/^1/, ""); // Remove non-digits and leading 1
};

// Validate US phone number
const isValidUSPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, "");
  // Must be 10 digits (or 11 if starts with 1)
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
};

// TCPA consent text - exact text shown to user (used as evidence)
const CONSENT_TEXT =
  "I agree to receive calls and texts about rental properties. By checking this box, I consent to automated calls and text messages. Message and data rates may apply.";

export const LeadCapturePopup: React.FC<LeadCapturePopupProps> = ({
  open,
  onOpenChange,
  propertyId,
  propertyAddress,
  organizationId,
  source = "website",
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    consent: false,
  });

  // Validate phone on change
  const handlePhoneChange = (value: string) => {
    setFormData((f) => ({ ...f, phone: value }));
    if (value && !isValidUSPhone(value)) {
      setPhoneError("Please enter a valid US phone number");
    } else {
      setPhoneError(null);
    }
  };

  // TCPA compliance - consent checkbox MUST be checked
  const isValid =
    isValidUSPhone(formData.phone) && formData.consent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Double-check consent is granted (legally required)
    if (!formData.consent) {
      toast({
        title: "Consent Required",
        description: "You must agree to receive communications to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const cleanPhone = formatPhoneForStorage(formData.phone);

      // Create the lead
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .insert({
          organization_id: organizationId,
          full_name: formData.name || null,
          phone: cleanPhone,
          source: "website",
          source_detail: propertyAddress || "Public listing page",
          interested_property_id: propertyId || null,
          call_consent: true,
          call_consent_at: now,
          sms_consent: true,
          sms_consent_at: now,
          status: "new",
          lead_score: 50,
        })
        .select("id")
        .single();

      if (leadError) throw leadError;

      // Log consent (TCPA compliance) - single entry for both call and SMS
      await supabase.from("consent_log").insert({
        organization_id: organizationId,
        lead_id: leadData.id,
        consent_type: "automated_calls",
        granted: true,
        method: "web_form",
        evidence_text: CONSENT_TEXT,
        ip_address: null, // Would need edge function to capture server-side
        user_agent: navigator.userAgent,
      });

      // Mark popup as shown in localStorage (persist across sessions)
      localStorage.setItem("leadCaptureSubmitted", "true");

      setSubmitted(true);
    } catch (error) {
      console.error("Error creating lead:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form after closing
    setTimeout(() => {
      setSubmitted(false);
      setFormData({
        name: "",
        phone: "",
        consent: false,
      });
      setPhoneError(null);
    }, 300);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center py-8 text-center">
            <div className="rounded-full bg-success/20 p-4 mb-4">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <DialogTitle className="text-xl mb-2">Great!</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              You'll receive a call in about 30 seconds.
            </DialogDescription>
            <Button className="mt-6" onClick={handleClose}>
              Continue Browsing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="rounded-full bg-success/20 p-3">
              <Phone className="h-6 w-6 text-success" />
            </div>
          </div>
          <DialogTitle className="text-2xl">
            We have an agent available right now!
          </DialogTitle>
          <DialogDescription className="text-base">
            Want us to call you and help you find a home today?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="(216) 555-1234"
                className={`pl-10 h-12 text-lg ${phoneError ? "border-destructive" : ""}`}
                required
                value={formData.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
              />
            </div>
            {phoneError && (
              <p className="text-xs text-destructive">{phoneError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name (Optional)</Label>
            <Input
              id="name"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) =>
                setFormData((f) => ({ ...f, name: e.target.value }))
              }
            />
          </div>

          {/* TCPA Consent - REQUIRED checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="consent"
              checked={formData.consent}
              onCheckedChange={(c) =>
                setFormData((f) => ({ ...f, consent: c === true }))
              }
              className="mt-1"
              required
            />
            <Label
              htmlFor="consent"
              className="text-sm font-normal leading-snug text-muted-foreground"
            >
              I agree to receive calls and texts about rental properties. By
              checking this box, I consent to automated calls and text messages.
              Message and data rates may apply. View our{" "}
              <a
                href="/p/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                Privacy Policy
              </a>
              .
            </Label>
          </div>

          {!formData.consent && (
            <p className="text-xs text-destructive">
              You must agree to receive communications to continue.
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-lg bg-success hover:bg-success/90 text-success-foreground"
            disabled={!isValid || loading}
          >
            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Call Me Now!
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Auto-popup hook - respects localStorage for submitted users
export const useLeadCapturePopup = (delaySeconds: number = 15) => {
  const [showPopup, setShowPopup] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    // Check if user already submitted (localStorage) or shown this session
    const alreadySubmitted = localStorage.getItem("leadCaptureSubmitted");
    const alreadyShownSession = sessionStorage.getItem("leadCaptureShown");

    if (alreadySubmitted || alreadyShownSession) {
      setHasShown(true);
      return;
    }

    const timer = setTimeout(() => {
      if (!hasShown) {
        setShowPopup(true);
        setHasShown(true);
        sessionStorage.setItem("leadCaptureShown", "true");
      }
    }, delaySeconds * 1000);

    return () => clearTimeout(timer);
  }, [delaySeconds, hasShown]);

  return {
    showPopup,
    setShowPopup,
    triggerPopup: () => setShowPopup(true),
  };
};
