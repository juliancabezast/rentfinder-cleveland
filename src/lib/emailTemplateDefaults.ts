// ── Email Template Config Types & Defaults ─────────────────────────────────
// Used by the Email Templates editor (Nurturing Leads) and referenced by the
// agent-task-dispatcher edge function for rendering custom templates.

export type EmailTemplateType =
  | "welcome"
  | "showing_confirmation"
  | "no_show"
  | "post_showing";

export interface EmailButton {
  text: string;
  url: string;
  style: "primary" | "secondary";
}

export interface EmailTemplateConfig {
  subject: string;
  headerTitle: string;
  headerSubtitle?: string;
  bodyParagraphs: string[];
  buttons: EmailButton[];
  showPropertyCard: boolean;
  showSteps: boolean;
  stepTexts?: string[];
  showSection8Badge: boolean;
  footerText: string;
}

export type EmailTemplatesMap = Partial<Record<EmailTemplateType, EmailTemplateConfig>>;

// ── Metadata for the editor UI ─────────────────────────────────────────────

export const TEMPLATE_TYPES: EmailTemplateType[] = [
  "welcome",
  "showing_confirmation",
  "no_show",
  "post_showing",
];

export const TEMPLATE_META: Record<
  EmailTemplateType,
  { label: string; description: string }
> = {
  welcome: {
    label: "Welcome",
    description: "Sent to new leads when they first enter the system",
  },
  showing_confirmation: {
    label: "Showing Reminder",
    description: "Reminder before a scheduled showing",
  },
  no_show: {
    label: "No-Show Follow-up",
    description: "Sent after a lead misses their showing",
  },
  post_showing: {
    label: "Post-Showing",
    description: "Follow-up after a completed showing",
  },
};

export const TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  welcome: [
    "{firstName}",
    "{fullName}",
    "{propertyAddress}",
    "{propertyRent}",
    "{propertyBeds}",
    "{propertyBaths}",
    "{orgName}",
    "{senderDomain}",
  ],
  showing_confirmation: [
    "{firstName}",
    "{fullName}",
    "{propertyAddress}",
    "{showingDate}",
    "{orgName}",
  ],
  no_show: [
    "{firstName}",
    "{fullName}",
    "{propertyAddress}",
    "{orgName}",
  ],
  post_showing: [
    "{firstName}",
    "{fullName}",
    "{propertyAddress}",
    "{orgName}",
    "{senderDomain}",
  ],
};

// ── Default Configs (mirror the current hardcoded builders) ────────────────

export const DEFAULT_CONFIGS: Record<EmailTemplateType, EmailTemplateConfig> = {
  welcome: {
    subject: "Welcome to {orgName}!",
    headerTitle: "{orgName}",
    headerSubtitle: "Quality Rental Homes in Cleveland",
    bodyParagraphs: [
      "Welcome, {firstName}!",
      "Thank you for your interest in our rental properties. We're excited to help you find your next home in Cleveland.",
    ],
    buttons: [
      { text: "Book a Showing", url: "https://{senderDomain}/p/book-showing", style: "primary" },
      { text: "Apply Now", url: "https://{senderDomain}/apply", style: "secondary" },
    ],
    showPropertyCard: true,
    showSteps: true,
    stepTexts: [
      "We'll match you with available properties",
      "Schedule a showing at your convenience",
      "Apply online and move in!",
    ],
    showSection8Badge: true,
    footerText: "Questions? Simply reply to this email — we're here to help.",
  },
  showing_confirmation: {
    subject: "Showing Reminder — {propertyAddress}",
    headerTitle: "{orgName}",
    bodyParagraphs: [
      "Hi {firstName},",
      "This is a friendly reminder about your upcoming showing at {propertyAddress} on {showingDate}.",
      "Please reply YES to confirm or call us if you need to reschedule.",
    ],
    buttons: [],
    showPropertyCard: true,
    showSteps: false,
    showSection8Badge: false,
    footerText: "Reply to this email or call us to reschedule.",
  },
  no_show: {
    subject: "We Missed You — {propertyAddress}",
    headerTitle: "{orgName}",
    bodyParagraphs: [
      "Hi {firstName},",
      "We noticed you weren't able to make it to the showing at {propertyAddress}. No worries — life happens!",
      "We'd love to reschedule at a time that works better for you.",
    ],
    buttons: [],
    showPropertyCard: false,
    showSteps: false,
    showSection8Badge: false,
    footerText: "Reply to reschedule or call us anytime.",
  },
  post_showing: {
    subject: "Next Steps — {propertyAddress}",
    headerTitle: "{orgName}",
    bodyParagraphs: [
      "Hi {firstName},",
      "Thanks for visiting {propertyAddress} today! We hope you enjoyed the tour.",
      "Ready to make it your new home? Start your application online:",
    ],
    buttons: [
      { text: "Start Application", url: "https://{senderDomain}/apply", style: "primary" },
    ],
    showPropertyCard: false,
    showSteps: false,
    showSection8Badge: false,
    footerText: "Have questions? Just reply to this email.",
  },
};

// ── Sample variables for live preview ──────────────────────────────────────

export const SAMPLE_VARIABLES: Record<string, string> = {
  "{firstName}": "Sarah",
  "{fullName}": "Sarah Johnson",
  "{propertyAddress}": "1234 Cedar Ave, Cleveland, OH 44103",
  "{propertyRent}": "$1,200",
  "{propertyBeds}": "3",
  "{propertyBaths}": "2",
  "{showingDate}": "Saturday, March 15 at 2:00 PM",
  "{orgName}": "Home Guard Management",
  "{senderDomain}": "rentfindercleveland.com",
};

// ── HTML Renderer ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function interpolate(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(key, escapeHtml(value)),
    text
  );
}

export function renderEmailHtml(
  config: EmailTemplateConfig,
  variables: Record<string, string>,
  propertyInfoHtml?: string
): string {
  const v = (text: string) => interpolate(text, variables);
  const PRIMARY = "#370d4b";
  const GOLD = "#ffb22c";

  const headerHtml = `
    <tr>
      <td style="background:linear-gradient(135deg,${PRIMARY} 0%,#5b1a7a 100%);padding:32px 30px;text-align:center;">
        <h1 style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:26px;font-weight:700;color:#ffffff;">
          ${v(config.headerTitle)}
        </h1>
        ${config.headerSubtitle ? `<p style="margin:8px 0 0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:${GOLD};font-weight:500;">${v(config.headerSubtitle)}</p>` : ""}
        <div style="width:60px;height:3px;background:${GOLD};margin:16px auto 0;border-radius:2px;"></div>
      </td>
    </tr>`;

  const bodyHtml = config.bodyParagraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.6;color:#333333;">${v(p)}</p>`
    )
    .join("\n");

  const propertyCardHtml =
    config.showPropertyCard && propertyInfoHtml
      ? `<div style="background:#f8f5ff;border-left:4px solid ${PRIMARY};border-radius:8px;padding:16px 20px;margin:20px 0;">
           ${propertyInfoHtml}
         </div>`
      : config.showPropertyCard
        ? `<div style="background:#f8f5ff;border-left:4px solid ${PRIMARY};border-radius:8px;padding:16px 20px;margin:20px 0;">
             <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#555;">
               <strong>${v("{propertyAddress}")}</strong><br/>
               ${variables["{propertyBeds}"] ? `${v("{propertyBeds}")} bed / ${v("{propertyBaths}")} bath` : ""}
               ${variables["{propertyRent}"] ? ` &middot; ${v("{propertyRent}")}/mo` : ""}
             </p>
           </div>`
        : "";

  const stepsHtml = config.showSteps && config.stepTexts?.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        ${config.stepTexts.map((step, i) => `
          <tr>
            <td width="36" valign="top" style="padding-bottom:12px;">
              <div style="width:28px;height:28px;border-radius:50%;background:${PRIMARY};color:#fff;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;text-align:center;line-height:28px;">${i + 1}</div>
            </td>
            <td style="padding:4px 0 12px 10px;font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#444;line-height:1.5;">${v(step)}</td>
          </tr>`).join("")}
       </table>`
    : "";

  const buttonsHtml = config.buttons.length
    ? `<div style="text-align:center;margin:24px 0;">
        ${config.buttons.map((btn) => {
          const bg = btn.style === "primary" ? PRIMARY : GOLD;
          const color = btn.style === "primary" ? "#ffffff" : "#1a1a1a";
          return `<a href="${v(btn.url)}" style="display:inline-block;background:${bg};color:${color};font-family:Montserrat,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;margin:6px 8px;">${v(btn.text)}</a>`;
        }).join("\n")}
       </div>`
    : "";

  const section8Html = config.showSection8Badge
    ? `<div style="text-align:center;margin:20px 0;">
         <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;font-family:Montserrat,Arial,sans-serif;font-size:13px;font-weight:600;padding:8px 18px;border-radius:20px;border:1px solid #c8e6c9;">
           Section 8 Vouchers Accepted
         </span>
       </div>`
    : "";

  const footerHtml = `
    <tr>
      <td style="padding:20px 30px;text-align:center;background:#f7f5fa;border-top:1px solid #e8e5ed;">
        <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#888;">${v(config.footerText)}</p>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f1f1;font-family:Montserrat,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f1;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        ${headerHtml}
        <tr><td style="padding:30px;">
          ${bodyHtml}
          ${propertyCardHtml}
          ${stepsHtml}
          ${buttonsHtml}
          ${section8Html}
        </td></tr>
        ${footerHtml}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
