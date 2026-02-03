// Email template helper functions for notification emails
// Brand colors matching the app design system
const BRAND = {
  primary: "#370d4b",
  accent: "#ffb22c",
  background: "#f4f1f1",
  textDark: "#1a1a1a",
  textLight: "#666666",
};

// Helper to create info row
function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; color: ${BRAND.textLight}; font-size: 14px; width: 140px; vertical-align: top;">${label}:</td>
      <td style="padding: 8px 0; color: ${BRAND.textDark}; font-size: 14px; font-weight: 500;">${value}</td>
    </tr>
  `;
}

// Helper to create CTA button
function ctaButton(text: string, url: string): string {
  return `
    <a href="${url}" style="display: inline-block; background-color: ${BRAND.accent}; color: ${BRAND.textDark}; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 16px;">
      ${text}
    </a>
  `;
}

// Helper to create a styled card section
function cardSection(title: string, content: string, borderColor: string = BRAND.primary): string {
  return `
    <div style="background-color: #f8f8f8; border-left: 4px solid ${borderColor}; padding: 16px 20px; border-radius: 4px; margin: 16px 0;">
      <h3 style="margin: 0 0 8px 0; color: ${BRAND.textDark}; font-size: 16px; font-weight: 600;">${title}</h3>
      ${content}
    </div>
  `;
}

interface PriorityLeadData {
  leadName: string;
  phone: string;
  email?: string;
  leadScore: number;
  priorityReason: string;
  propertyAddress?: string;
  source: string;
  appUrl: string;
  leadId: string;
}

export function priorityLeadTemplate(data: PriorityLeadData): string {
  const leadUrl = `${data.appUrl}/leads/${data.leadId}`;
  
  return `
    <div style="margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #fee2e2; color: #dc2626; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
        🔥 PRIORITY LEAD
      </div>
      <h2 style="margin: 0; color: ${BRAND.textDark}; font-size: 22px; font-weight: 700;">
        ${data.leadName}
      </h2>
      <p style="margin: 8px 0 0 0; color: ${BRAND.textLight}; font-size: 14px;">
        A new high-priority lead requires immediate attention.
      </p>
    </div>
    
    <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 24px;">
      ${infoRow("Phone", data.phone)}
      ${data.email ? infoRow("Email", data.email) : ""}
      ${infoRow("Lead Score", `<span style="background-color: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${data.leadScore}</span>`)}
      ${infoRow("Priority Reason", data.priorityReason)}
      ${data.propertyAddress ? infoRow("Interested In", data.propertyAddress) : ""}
      ${infoRow("Source", data.source)}
    </table>
    
    ${cardSection("Recommended Action", `
      <p style="margin: 0; color: ${BRAND.textLight}; font-size: 14px;">
        This lead has a score of ${data.leadScore}+, indicating high purchase intent. 
        Contact them within the next 30 minutes for best results.
      </p>
    `, "#dc2626")}
    
    <div style="text-align: center; margin-top: 24px;">
      ${ctaButton("View Lead Details →", leadUrl)}
    </div>
  `;
}

interface NoShowData {
  leadName: string;
  phone: string;
  propertyAddress: string;
  scheduledTime: string;
  agentName?: string;
  appUrl: string;
  showingId: string;
  leadId: string;
}

export function noShowTemplate(data: NoShowData): string {
  const leadUrl = `${data.appUrl}/leads/${data.leadId}`;
  
  return `
    <div style="margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #fef3c7; color: #d97706; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
        ⚠️ NO-SHOW ALERT
      </div>
      <h2 style="margin: 0; color: ${BRAND.textDark}; font-size: 22px; font-weight: 700;">
        ${data.leadName} missed their showing
      </h2>
      <p style="margin: 8px 0 0 0; color: ${BRAND.textLight}; font-size: 14px;">
        The lead did not attend their scheduled property showing.
      </p>
    </div>
    
    <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 24px;">
      ${infoRow("Lead Name", data.leadName)}
      ${infoRow("Phone", data.phone)}
      ${infoRow("Property", data.propertyAddress)}
      ${infoRow("Scheduled Time", data.scheduledTime)}
      ${data.agentName ? infoRow("Leasing Agent", data.agentName) : ""}
    </table>
    
    ${cardSection("Automated Follow-Up", `
      <p style="margin: 0; color: ${BRAND.textLight}; font-size: 14px;">
        ✅ The no-show follow-up AI agent has been triggered and will attempt to 
        contact ${data.leadName} to reschedule within the next 2 hours.
      </p>
    `, "#d97706")}
    
    <div style="text-align: center; margin-top: 24px;">
      ${ctaButton("View Lead →", leadUrl)}
    </div>
  `;
}

interface CriticalErrorData {
  service: string;
  eventType: string;
  errorMessage: string;
  timestamp: string;
  affectedEntity?: string;
  suggestedAction?: string;
  appUrl: string;
}

export function criticalErrorTemplate(data: CriticalErrorData): string {
  const logsUrl = `${data.appUrl}/system-logs`;
  
  return `
    <div style="margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #fee2e2; color: #dc2626; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
        🚨 CRITICAL ERROR
      </div>
      <h2 style="margin: 0; color: ${BRAND.textDark}; font-size: 22px; font-weight: 700;">
        ${data.service} — ${data.eventType}
      </h2>
      <p style="margin: 8px 0 0 0; color: ${BRAND.textLight}; font-size: 14px;">
        A critical system error has occurred that requires attention.
      </p>
    </div>
    
    <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 24px;">
      ${infoRow("Service", data.service)}
      ${infoRow("Event Type", data.eventType)}
      ${infoRow("Timestamp", data.timestamp)}
      ${data.affectedEntity ? infoRow("Affected Entity", data.affectedEntity) : ""}
    </table>
    
    ${cardSection("Error Details", `
      <pre style="margin: 0; white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 13px; color: #dc2626; background-color: #fff; padding: 12px; border-radius: 4px; border: 1px solid #fecaca;">
${data.errorMessage}
      </pre>
    `, "#dc2626")}
    
    ${data.suggestedAction ? cardSection("Suggested Action", `
      <p style="margin: 0; color: ${BRAND.textLight}; font-size: 14px;">
        ${data.suggestedAction}
      </p>
    `, BRAND.primary) : ""}
    
    <div style="text-align: center; margin-top: 24px;">
      ${ctaButton("View System Logs →", logsUrl)}
    </div>
  `;
}

interface TestEmailData {
  organizationName?: string;
}

export function testEmailTemplate(data: TestEmailData = {}): string {
  return `
    <div style="text-align: center; padding: 32px 0;">
      <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
      <h2 style="margin: 0; color: ${BRAND.textDark}; font-size: 24px; font-weight: 700;">
        Email Notifications Working!
      </h2>
      <p style="margin: 16px 0 0 0; color: ${BRAND.textLight}; font-size: 16px; max-width: 400px; margin-left: auto; margin-right: auto;">
        Great news! Your email notification system is properly configured and ready to send alerts.
      </p>
    </div>
    
    ${cardSection("You'll receive alerts for:", `
      <ul style="margin: 0; padding-left: 20px; color: ${BRAND.textLight}; font-size: 14px;">
        <li style="margin-bottom: 8px;">🔥 Priority lead notifications</li>
        <li style="margin-bottom: 8px;">⚠️ Showing no-show alerts</li>
        <li style="margin-bottom: 8px;">🚨 Critical system errors</li>
        <li>📊 Daily summary reports (coming soon)</li>
      </ul>
    `, BRAND.accent)}
    
    <p style="margin: 24px 0 0 0; color: ${BRAND.textLight}; font-size: 14px; text-align: center;">
      You can customize your notification preferences in Settings → Communications.
    </p>
  `;
}

interface DailySummaryData {
  date: string;
  newLeads: number;
  showingsToday: number;
  completedShowings: number;
  noShows: number;
  pendingTasks: number;
  topPriorityLead?: string;
  appUrl: string;
}

export function dailySummaryTemplate(data: DailySummaryData): string {
  return `
    <div style="margin-bottom: 24px;">
      <div style="display: inline-block; background-color: #dbeafe; color: #1d4ed8; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">
        📊 DAILY SUMMARY
      </div>
      <h2 style="margin: 0; color: ${BRAND.textDark}; font-size: 22px; font-weight: 700;">
        ${data.date}
      </h2>
      <p style="margin: 8px 0 0 0; color: ${BRAND.textLight}; font-size: 14px;">
        Here's your daily activity summary.
      </p>
    </div>
    
    <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 24px;">
      <tr>
        <td style="text-align: center; padding: 16px; background-color: #f8f8f8; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND.primary};">${data.newLeads}</div>
          <div style="font-size: 12px; color: ${BRAND.textLight}; margin-top: 4px;">New Leads</div>
        </td>
        <td style="width: 16px;"></td>
        <td style="text-align: center; padding: 16px; background-color: #f8f8f8; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND.primary};">${data.showingsToday}</div>
          <div style="font-size: 12px; color: ${BRAND.textLight}; margin-top: 4px;">Showings Today</div>
        </td>
        <td style="width: 16px;"></td>
        <td style="text-align: center; padding: 16px; background-color: #f8f8f8; border-radius: 8px; width: 33%;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND.primary};">${data.pendingTasks}</div>
          <div style="font-size: 12px; color: ${BRAND.textLight}; margin-top: 4px;">Pending Tasks</div>
        </td>
      </tr>
    </table>
    
    <table role="presentation" cellspacing="0" cellpadding="0" style="width: 100%; margin-bottom: 24px;">
      ${infoRow("Completed Showings", String(data.completedShowings))}
      ${infoRow("No-Shows", `<span style="color: ${data.noShows > 0 ? '#dc2626' : BRAND.textDark};">${data.noShows}</span>`)}
      ${data.topPriorityLead ? infoRow("Top Priority", data.topPriorityLead) : ""}
    </table>
    
    <div style="text-align: center; margin-top: 24px;">
      ${ctaButton("View Dashboard →", data.appUrl)}
    </div>
  `;
}
