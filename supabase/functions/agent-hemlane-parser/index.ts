import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HemlaneLeadData {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  property: string | null;
  message: string | null;
  listingReference: string | null;
}

// Parse Hemlane email body to extract lead data
function parseHemlaneEmail(subject: string, body: string): HemlaneLeadData {
  const data: HemlaneLeadData = {
    name: null,
    firstName: null,
    lastName: null,
    phone: null,
    email: null,
    property: null,
    message: null,
    listingReference: null,
  };

  // Common patterns in Hemlane emails
  const nameMatch = body.match(/(?:Name|Contact|From):\s*(.+?)(?:\n|$)/i);
  if (nameMatch) {
    data.name = nameMatch[1].trim();
    const nameParts = data.name.split(/\s+/);
    if (nameParts.length >= 2) {
      data.firstName = nameParts[0];
      data.lastName = nameParts.slice(1).join(" ");
    } else if (nameParts.length === 1) {
      data.firstName = nameParts[0];
    }
  }

  const phoneMatch = body.match(/(?:Phone|Tel|Mobile|Cell):\s*([+\d\s\-().]+)/i);
  if (phoneMatch) {
    data.phone = phoneMatch[1].replace(/[^\d+]/g, "").trim();
  }

  const emailMatch = body.match(/(?:Email|E-mail):\s*([^\s\n]+@[^\s\n]+)/i);
  if (emailMatch) {
    data.email = emailMatch[1].trim().toLowerCase();
  }

  const propertyMatch = body.match(/(?:Property|Address|Listing|Unit):\s*(.+?)(?:\n|$)/i);
  if (propertyMatch) {
    data.property = propertyMatch[1].trim();
  }

  const messageMatch = body.match(/(?:Message|Notes|Comments|Inquiry):\s*([\s\S]+?)(?:(?:\n\n)|(?:--)|$)/i);
  if (messageMatch) {
    data.message = messageMatch[1].trim().slice(0, 1000);
  }

  // Extract listing reference from subject or body
  const refMatch = subject.match(/(?:Listing|Ref|ID)[\s#:]*(\w+)/i) || 
                   body.match(/(?:Listing|Reference|ID)[\s#:]*(\w+)/i);
  if (refMatch) {
    data.listingReference = refMatch[1];
  }

  return data;
}

// Normalize phone to E.164
function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

serve(async (req) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let emailsProcessed = 0;
  let leadsCreated = 0;
  let duplicatesSkipped = 0;
  let errors = 0;

  try {
    const body = await req.json().catch(() => ({}));
    const targetOrgId = body.organization_id;

    // Fetch orgs with Hemlane/Gmail integration configured
    let orgsQuery = supabase
      .from("organization_settings")
      .select("organization_id, gmail_oauth_token, gmail_app_password")
      .not("gmail_oauth_token", "is", null);

    if (targetOrgId) {
      orgsQuery = orgsQuery.eq("organization_id", targetOrgId);
    }

    const { data: orgs, error: orgsError } = await orgsQuery;

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    if (!orgs || orgs.length === 0) {
      console.log("No organizations with Gmail configured");
      return new Response(
        JSON.stringify({ 
          success: true, 
          emails_processed: 0, 
          leads_created: 0, 
          duplicates_skipped: 0,
          message: "No organizations with Gmail integration configured"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const org of orgs) {
      const orgId = org.organization_id;
      const gmailToken = org.gmail_oauth_token;

      if (!gmailToken) {
        console.log(`Org ${orgId}: No Gmail credentials configured, skipping`);
        continue;
      }

      try {
        // Search for Hemlane emails using Gmail API
        const searchQuery = encodeURIComponent(
          "from:notifications@hemlane.com OR from:noreply@hemlane.com newer_than:1d"
        );

        const listResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=50`,
          {
            headers: {
              Authorization: `Bearer ${gmailToken}`,
            },
          }
        );

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          console.error(`Org ${orgId}: Gmail API error: ${errorText}`);
          
          // Log warning for admin
          await supabase.rpc("log_agent_activity", {
            p_organization_id: orgId,
            p_agent_key: "hemlane_parser",
            p_action: "gmail_api_error",
            p_status: "failure",
            p_message: `Gmail API access failed - token may be expired`,
            p_details: { error: errorText.slice(0, 500) },
            p_execution_ms: Date.now() - startTime,
          });
          errors++;
          continue;
        }

        const listData = await listResponse.json();
        const messages = listData.messages || [];

        for (const msg of messages) {
          try {
            // Check if already processed
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("organization_id", orgId)
              .eq("hemlane_email_id", msg.id)
              .maybeSingle();

            if (existingLead) {
              duplicatesSkipped++;
              continue;
            }

            // Fetch full message
            const msgResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              {
                headers: {
                  Authorization: `Bearer ${gmailToken}`,
                },
              }
            );

            if (!msgResponse.ok) {
              console.error(`Failed to fetch message ${msg.id}`);
              continue;
            }

            const msgData = await msgResponse.json();
            emailsProcessed++;

            // Extract subject
            const subjectHeader = msgData.payload?.headers?.find(
              (h: any) => h.name.toLowerCase() === "subject"
            );
            const subject = subjectHeader?.value || "";

            // Extract body (handle multipart)
            let emailBody = "";
            if (msgData.payload?.body?.data) {
              emailBody = atob(msgData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
            } else if (msgData.payload?.parts) {
              for (const part of msgData.payload.parts) {
                if (part.mimeType === "text/plain" && part.body?.data) {
                  emailBody = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
                  break;
                }
              }
            }

            if (!emailBody) {
              console.log(`Message ${msg.id}: No parseable body`);
              continue;
            }

            // Parse lead data
            const leadData = parseHemlaneEmail(subject, emailBody);

            if (!leadData.phone && !leadData.email) {
              console.log(`Message ${msg.id}: No contact info found`);
              continue;
            }

            // Try to match property
            let propertyId: string | null = null;
            if (leadData.property) {
              const { data: matchedProperty } = await supabase
                .from("properties")
                .select("id")
                .eq("organization_id", orgId)
                .ilike("address", `%${leadData.property}%`)
                .limit(1)
                .maybeSingle();
              
              if (matchedProperty) {
                propertyId = matchedProperty.id;
              }
            }

            // Create lead
            const { data: newLead, error: insertError } = await supabase
              .from("leads")
              .insert({
                organization_id: orgId,
                first_name: leadData.firstName,
                last_name: leadData.lastName,
                full_name: leadData.name,
                phone: normalizePhone(leadData.phone || ""),
                email: leadData.email,
                source: "hemlane_email",
                source_detail: leadData.listingReference 
                  ? `Hemlane: ${leadData.listingReference}` 
                  : "Hemlane Email Inquiry",
                hemlane_email_id: msg.id,
                interested_property_id: propertyId,
                status: "new",
              })
              .select("id")
              .single();

            if (insertError) {
              // Check if duplicate (Noah trigger may have caught it)
              if (insertError.message?.includes("duplicate")) {
                duplicatesSkipped++;
              } else {
                console.error(`Failed to create lead from ${msg.id}:`, insertError);
                errors++;
              }
            } else {
              leadsCreated++;
              console.log(`Created lead ${newLead.id} from Hemlane email ${msg.id}`);
            }

          } catch (msgError) {
            console.error(`Error processing message ${msg.id}:`, msgError);
            errors++;
          }
        }

      } catch (orgError) {
        console.error(`Error processing org ${orgId}:`, orgError);
        errors++;
      }
    }

    // Log summary
    await supabase.rpc("log_agent_activity", {
      p_organization_id: targetOrgId || orgs[0]?.organization_id,
      p_agent_key: "hemlane_parser",
      p_action: "parse_complete",
      p_status: leadsCreated > 0 || emailsProcessed === 0 ? "success" : errors > 0 ? "partial" : "success",
      p_message: `Processed ${emailsProcessed} emails, created ${leadsCreated} leads, ${duplicatesSkipped} duplicates skipped`,
      p_details: {
        emails_processed: emailsProcessed,
        leads_created: leadsCreated,
        duplicates_skipped: duplicatesSkipped,
        errors,
        orgs_processed: orgs.length,
      },
      p_execution_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        emails_processed: emailsProcessed,
        leads_created: leadsCreated,
        duplicates_skipped: duplicatesSkipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Hemlane parser error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
