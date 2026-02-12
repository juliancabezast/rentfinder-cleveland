import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Home, CheckCircle, AlertCircle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmsConsentCheckbox, buildConsentPayload } from "@/components/public/SmsConsentCheckbox";

interface ReferralInfo {
  referrer_name: string;
  organization: {
    name: string;
    slug: string;
  };
}

const ReferralPage: React.FC = () => {
  const { referralCode } = useParams<{ referralCode: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const validateCode = async () => {
      if (!referralCode) {
        setError("No referral code provided");
        setLoading(false);
        return;
      }

      try {
        const { data, error: funcError } = await supabase.functions.invoke(
          "trigger-referral-campaign",
          {
            body: { action: "validate_code", referral_code: referralCode },
          }
        );

        if (funcError || !data?.valid) {
          setError(data?.error || "Invalid referral code");
        } else {
          setReferralInfo({
            referrer_name: data.referrer_name,
            organization: data.organization,
          });
        }
      } catch (err) {
        console.error("Error validating referral code:", err);
        setError("Failed to validate referral code");
      } finally {
        setLoading(false);
      }
    };

    validateCode();
  }, [referralCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      toast.error("Please fill in your name and phone number");
      return;
    }

    if (!consent) {
      toast.error("Please agree to receive SMS messages");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: funcError } = await supabase.functions.invoke(
        "trigger-referral-campaign",
        {
          body: {
            action: "submit_referral",
            referral_code: referralCode,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            consent,
            ...buildConsentPayload(consent),
          },
        }
      );

      if (funcError || !data?.success) {
        throw new Error(data?.error || "Failed to submit referral");
      }

      setSubmitted(true);
      toast.success("Welcome! Our team will contact you shortly.");
    } catch (err) {
      console.error("Error submitting referral:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Invalid Referral</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <Button asChild variant="outline">
              <Link to="/">Browse Available Properties</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Welcome!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Our team will call you shortly to help you find the perfect home.
            </p>
            <p className="text-sm text-muted-foreground">
              Thank you for your interest! We'll be in touch within 24 hours.
            </p>
            <Button asChild className="w-full mt-4">
              <Link to="/">Browse Available Properties</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">
              {referralInfo?.organization?.name || "Rent Finder"}
            </span>
          </div>
          <CardTitle className="text-2xl">
            {referralInfo?.referrer_name} thinks you'd love our available
            properties!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Special Offer Banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Gift className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-primary">Special Referral Offer</p>
                <p className="text-sm text-muted-foreground">
                  When you sign a lease, {referralInfo?.referrer_name} receives a
                  reward — and you get priority showing scheduling!
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <SmsConsentCheckbox
              checked={consent}
              onCheckedChange={setConsent}
            />

            <Button
              type="submit"
              className="w-full h-12 text-lg"
              disabled={submitting}
            >
              <Home className="h-5 w-5 mr-2" />
              {submitting ? "Submitting..." : "Find Me a Home!"}
            </Button>
          </form>

          {/* Referral Code Display */}
          <div className="text-center pt-2">
            <p className="text-sm text-muted-foreground">Referral Code</p>
            <Badge variant="secondary" className="font-mono text-base mt-1">
              {referralCode}
            </Badge>
          </div>

          {/* Browse Properties Link */}
          <Button asChild variant="link" className="w-full">
            <Link to="/">Browse Available Properties →</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferralPage;
