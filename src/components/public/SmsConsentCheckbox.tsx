import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const SMS_CONSENT_VERSION = "1.1";

export const SMS_CONSENT_LANGUAGE =
  "I agree to receive automated phone calls and SMS text messages from Rent Finder Cleveland / HomeGuard regarding property updates, showing reminders, and related communications. Calls may be recorded for quality purposes. Message frequency varies. Msg&data rates may apply. Reply STOP to unsubscribe at any time. Reply HELP for help. Consent is not required to apply for housing.";

/** Builds the consent metadata payload to send to the edge function. */
export function buildConsentPayload(granted: boolean) {
  return {
    sms_consent: granted,
    call_consent: granted,
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
        {SMS_CONSENT_LANGUAGE} View our{" "}
        <a
          href="https://rentfindercleveland.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          Privacy Policy
        </a>{" "}
        and{" "}
        <a
          href="https://rentfindercleveland.com/terms-and-conditions"
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
