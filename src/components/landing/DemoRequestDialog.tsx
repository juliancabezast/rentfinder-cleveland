import React, { useState } from "react";
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
import { Loader2, CheckCircle2, Rocket } from "lucide-react";
import { z } from "zod";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { SmsConsentCheckbox, buildConsentPayload } from "@/components/public/SmsConsentCheckbox";

interface DemoRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Validation schema
const demoRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email is too long"),
  phone: z.string().trim().min(10, "Please enter a valid phone number").max(20, "Phone number is too long"),
});

export const DemoRequestDialog: React.FC<DemoRequestDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [smsConsent, setSmsConsent] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const result = demoRequestSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    // Require consent when phone is provided
    if (formData.phone.trim() && !smsConsent) {
      setErrors({ smsConsent: "Please agree to receive calls and SMS messages" });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-demo-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            full_name: formData.fullName.trim(),
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone.trim().replace(/\D/g, ""),
            ...buildConsentPayload(smsConsent),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit. Please try again.");
      }

      setSubmitted(true);
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error("Demo request error:", err);
      setErrors({ form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form after closing
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ fullName: "", email: "", phone: "" });
      setSmsConsent(false);
      setErrors({});
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
            <DialogTitle className="text-xl mb-2">Thanks!</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              We'll reach out within 24 hours to get you started.
            </DialogDescription>
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
            <div className="rounded-full bg-primary/20 p-3">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl">Start Your Free Trial</DialogTitle>
          <DialogDescription className="text-base">
            Get 14 days free. No credit card required. We'll help you set up your first AI agent.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              placeholder="John Smith"
              value={formData.fullName}
              onChange={(e) => handleInputChange("fullName", e.target.value)}
              className={errors.fullName ? "border-destructive" : ""}
            />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(216) 555-1234"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className={errors.phone ? "border-destructive" : ""}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
          </div>

          <SmsConsentCheckbox
            checked={smsConsent}
            onCheckedChange={(checked) => {
              setSmsConsent(checked);
              if (errors.smsConsent) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.smsConsent;
                  return next;
                });
              }
            }}
            error={!!errors.smsConsent}
          />
          {errors.smsConsent && (
            <p className="text-xs text-destructive">{errors.smsConsent}</p>
          )}

          {errors.form && (
            <p className="text-sm text-destructive text-center">{errors.form}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Start Free Trial
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};