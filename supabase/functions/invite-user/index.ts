import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Verify the caller is admin/super_admin ─────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: callerAuth },
    } = await supabase.auth.getUser(token);

    if (!callerAuth) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get the caller's user record to check role and org
    const { data: callerUser } = await supabase
      .from("users")
      .select("id, organization_id, role")
      .eq("auth_user_id", callerAuth.id)
      .single();

    if (!callerUser) {
      return new Response(
        JSON.stringify({ error: "Caller user record not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!["super_admin", "admin"].includes(callerUser.role)) {
      return new Response(
        JSON.stringify({ error: "Only admins can invite users" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Parse request body ─────────────────────────────────────────
    const { email, role, full_name, commission_rate, property_ids } =
      await req.json();

    if (!email || !role || !full_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, role, full_name" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent creating super_admin
    if (role === "super_admin") {
      return new Response(
        JSON.stringify({ error: "Cannot create super_admin users via invite" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validRoles = ["admin", "editor", "viewer", "leasing_agent"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role: ${role}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const organizationId = callerUser.organization_id;

    // ── Check if user already exists in org ────────────────────────
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists in your organization" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Create auth user via Admin API ─────────────────────────────
    // Try invite first; if user already exists in auth, link them
    let authUserId: string;
    let warning: string | null = null;

    // Use inviteUserByEmail to create and send invite email
    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.inviteUserByEmail(email.toLowerCase(), {
        data: {
          full_name,
          organization_id: organizationId,
          role,
        },
      });

    if (inviteError) {
      // If user already exists in auth, just get their ID
      if (
        inviteError.message?.includes("already been registered") ||
        inviteError.message?.includes("already exists")
      ) {
        // Find the existing auth user
        const { data: authList } = await supabase.auth.admin.listUsers();
        const existingAuth = authList?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (existingAuth) {
          authUserId = existingAuth.id;
          warning =
            "User already has an account. They can log in with their existing password.";
        } else {
          throw new Error("User exists in auth but could not be found");
        }
      } else {
        throw inviteError;
      }
    } else {
      authUserId = inviteData.user.id;
    }

    // ── Create user record in our users table ──────────────────────
    const { data: newUser, error: userError } = await supabase
      .from("users")
      .insert({
        auth_user_id: authUserId,
        organization_id: organizationId,
        email: email.toLowerCase(),
        full_name,
        role,
        commission_rate:
          role === "leasing_agent" && commission_rate
            ? commission_rate
            : null,
        is_active: true,
        invited_by: callerUser.id,
        invited_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (userError) {
      console.error("Error creating user record:", userError);
      throw new Error(`Failed to create user record: ${userError.message}`);
    }

    // ── Grant property access for viewer role ──────────────────────
    if (role === "viewer" && property_ids && property_ids.length > 0) {
      const accessRecords = property_ids.map((propertyId: string) => ({
        organization_id: organizationId,
        investor_id: newUser.id,
        property_id: propertyId,
        granted_by: callerUser.id,
      }));

      const { error: accessError } = await supabase
        .from("investor_property_access")
        .insert(accessRecords);

      if (accessError) {
        console.error("Error granting property access:", accessError);
        // Non-blocking — user was still created
      }
    }

    // ── Send welcome email via our email function ──────────────────
    try {
      // Get organization name for email
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      await supabase.functions.invoke("send-notification-email", {
        body: {
          to: email.toLowerCase(),
          subject: `You've been invited to ${org?.name || "Rent Finder Cleveland"}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <div style="background-color:#370d4b;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;color:#ffb22c;font-size:20px;">Welcome to ${org?.name || "Rent Finder Cleveland"}</h1>
            </div>
            <div style="background-color:#ffffff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
              <p>Hi <strong>${full_name}</strong>,</p>
              <p>You've been invited to join <strong>${org?.name || "Rent Finder Cleveland"}</strong> as a <strong>${role.replace("_", " ")}</strong>.</p>
              <p>Check your email for a separate login link, or visit our platform to get started.</p>
              <br>
              <p style="color:#666;font-size:14px;">— ${org?.name || "Rent Finder Cleveland"} Team</p>
            </div>
          </div>`,
          notification_type: "user_invite",
          organization_id: organizationId,
          related_entity_id: newUser.id,
          related_entity_type: "user",
        },
      });
    } catch {
      // Non-blocking email
    }

    // ── Log to system_logs ─────────────────────────────────────────
    await supabase.from("system_logs").insert({
      organization_id: organizationId,
      level: "info",
      category: "general",
      event_type: "user_invited",
      message: `User invited: ${full_name} (${email}) as ${role}`,
      details: {
        invited_email: email,
        invited_role: role,
        invited_by: callerUser.id,
        new_user_id: newUser.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.id,
        warning: warning || undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("invite-user error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Failed to invite user",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
