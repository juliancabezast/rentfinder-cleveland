import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const SMS_CONSENT_VERSION = "2.0";

// SMS-only, opt-in (voice was removed from the product; "HomeGuard" brand retired).
// This is OPTIONAL — booking a tour never depends on it (a confirmation email
// still goes out either way). Keep it plain-language so it doesn't scare renters
// off at the final step.
export const SMS_CONSENT_LANGUAGE =
  "Text me showing reminders and updates about my tour and this home. Message frequency varies; msg & data rates may apply. Reply STOP to opt out anytime, HELP for help. Consent isn't required to book a tour or to apply for housing.";

/** Builds the consent metadata payload to send to the edge function. */
export function buildConsentPayload(granted: boolean) {
  return {
    sms_consent: granted,
    // Voice was removed from the product and the disclosed language is SMS-only,
    // so we never record call consent (avoids a TCPA evidence mismatch).
    call_consent: false,
    consent_method: "web" as const,
    consent_source_url: window.location.href,
    consent_language: SMS_CONSENT_LANGUAGE,
    consent_version: SMS_CONSENT_VERSION,
    user_agent: navigator.userAgent,
    consent_at: new Date().toISOString(),
  };
}

interface SmsConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: boolean;
  compact?: boolean;
}

export const SmsConsentCheckbox: React.FC<SmsConsentCheckboxProps> = ({
  checked,
  onCheckedChange,
  error,
  compact,
}) => {
  return (
    <div className={cn("flex items-start gap-2", compact ? "pt-1" : "pt-2")}>
      <Checkbox
        id="sms-consent"
        checked={checked}
        onCheckedChange={(val) => onCheckedChange(val as boolean)}
        className={cn(error && "border-destructive")}
      />
      <label
        htmlFor="sms-consent"
        className={cn(
          "leading-tight cursor-pointer select-none",
          compact ? "text-[11px]" : "text-xs",
          error ? "text-destructive" : "text-muted-foreground"
        )}
      >
        <span className="font-semibold">Optional —</span> {SMS_CONSENT_LANGUAGE} View our{" "}
        <a
          href="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="/terms-and-conditions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          Terms
        </a>
        .
      </label>
    </div>
  );
};
