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
import { Loader2, Phone, Home, CheckCircle2 } from "lucide-react";
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

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    smsConsent: false,
    callConsent: false,
  });

  // TCPA compliance - consent checkbox must be checked
  const isValid =
    formData.phone.length >= 10 &&
    (formData.smsConsent || formData.callConsent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();

      // Create the lead
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .insert({
          organization_id: organizationId,
          first_name: formData.firstName || null,
          last_name: formData.lastName || null,
          full_name:
            [formData.firstName, formData.lastName].filter(Boolean).join(" ") ||
            null,
          phone: formData.phone,
          email: formData.email || null,
          source: source,
          source_detail: propertyAddress || "Public listing page",
          interested_property_id: propertyId || null,
          sms_consent: formData.smsConsent,
          sms_consent_at: formData.smsConsent ? now : null,
          call_consent: formData.callConsent,
          call_consent_at: formData.callConsent ? now : null,
          status: "new",
          lead_score: 50,
        })
        .select("id")
        .single();

      if (leadError) throw leadError;

      // Log consent (TCPA compliance)
      const consentRecords = [];
      
      if (formData.smsConsent) {
        consentRecords.push({
          organization_id: organizationId,
          lead_id: leadData.id,
          consent_type: "sms_marketing",
          granted: true,
          method: "web_form",
          evidence_text:
            "I consent to receive text messages about this property and other rental opportunities. Message & data rates may apply. Reply STOP to unsubscribe.",
          ip_address: null, // Would need edge function to capture
          user_agent: navigator.userAgent,
        });
      }

      if (formData.callConsent) {
        consentRecords.push({
          organization_id: organizationId,
          lead_id: leadData.id,
          consent_type: "automated_calls",
          granted: true,
          method: "web_form",
          evidence_text:
            "I consent to receive automated calls about this property and other rental opportunities.",
          ip_address: null,
          user_agent: navigator.userAgent,
        });
      }

      if (consentRecords.length > 0) {
        await supabase.from("consent_log").insert(consentRecords);
      }

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
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        smsConsent: false,
        callConsent: false,
      });
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
            <DialogTitle className="text-xl mb-2">Thank You!</DialogTitle>
            <DialogDescription className="text-base">
              We've received your information and will be in touch soon to help
              you find your perfect home.
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
                className="pl-10 h-12 text-lg"
                required
                value={formData.phone}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstName">Name (Optional)</Label>
            <Input
              id="firstName"
              placeholder="Your name"
              value={formData.firstName}
              onChange={(e) =>
                setFormData((f) => ({ ...f, firstName: e.target.value }))
              }
            />
          </div>

          {/* TCPA Consent - Single Combined Checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="consent"
              checked={formData.smsConsent && formData.callConsent}
              onCheckedChange={(c) =>
                setFormData((f) => ({
                  ...f,
                  smsConsent: c === true,
                  callConsent: c === true,
                }))
              }
              className="mt-1"
            />
            <Label htmlFor="consent" className="text-sm font-normal leading-snug text-muted-foreground">
              I agree to receive calls and texts about rental properties.
              By checking this box, I consent to automated calls and
              text messages. Message and data rates may apply.{" "}
              <a href="#" className="text-primary underline hover:no-underline">
                View our Privacy Policy
              </a>.
            </Label>
          </div>

          {!(formData.smsConsent && formData.callConsent) && (
            <p className="text-xs text-destructive">
              Please agree to receive communications to continue.
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

// Auto-popup hook
export const useLeadCapturePopup = (delaySeconds: number = 15) => {
  const [showPopup, setShowPopup] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    // Check if already shown in this session
    const alreadyShown = sessionStorage.getItem("leadCaptureShown");
    if (alreadyShown) {
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
