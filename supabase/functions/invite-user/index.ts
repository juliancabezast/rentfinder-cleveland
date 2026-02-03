import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  role: string;
  full_name: string;
  commission_rate?: number;
  property_ids?: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get and validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Create Supabase client with user's token for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the calling user's JWT and get claims
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callingUserId = claimsData.user.id;

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if calling user has admin role
    const { data: callingUser, error: userError } = await adminClient
      .from("users")
      .select("id, role, organization_id")
      .eq("auth_user_id", callingUserId)
      .eq("is_active", true)
      .single();

    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ error: "User not found or inactive" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow admin or super_admin to invite users
    if (!["admin", "super_admin"].includes(callingUser.role)) {
      return new Response(
        JSON.stringify({ error: "Only administrators can invite users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: InviteRequest = await req.json();
    const { email, role, full_name, commission_rate, property_ids } = body;

    // Validate required fields
    if (!email || !role || !full_name) {
      return new Response(
        JSON.stringify({ error: "Email, role, and full_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent creating super_admin
    if (role === "super_admin") {
      return new Response(
        JSON.stringify({ error: "Cannot create super_admin users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate role
    const validRoles = ["admin", "editor", "viewer", "leasing_agent"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists in the users table for this organization
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .eq("organization_id", callingUser.organization_id)
      .single();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists in your organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user record in users table first
    const { data: newUser, error: createUserError } = await adminClient
      .from("users")
      .insert({
        organization_id: callingUser.organization_id,
        email: email.toLowerCase().trim(),
        full_name: full_name.trim(),
        role,
        commission_rate: role === "leasing_agent" ? commission_rate : null,
        is_active: true,
      })
      .select()
      .single();

    if (createUserError) {
      console.error("Error creating user record:", createUserError);
      return new Response(
        JSON.stringify({ error: "Failed to create user record: " + createUserError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If viewer, create property access records
    if (role === "viewer" && property_ids && property_ids.length > 0 && newUser) {
      const accessRecords = property_ids.map((propertyId: string) => ({
        organization_id: callingUser.organization_id,
        investor_id: newUser.id,
        property_id: propertyId,
        granted_by: callingUser.id,
      }));

      const { error: accessError } = await adminClient
        .from("investor_property_access")
        .insert(accessRecords);

      if (accessError) {
        console.error("Error creating property access:", accessError);
        // Don't fail the whole operation, just log
      }
    }

    // Send invite email using admin API
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        redirectTo: `${req.headers.get("origin") || "https://cleveland-lease-buddy.lovable.app"}/auth/reset-password`,
        data: {
          full_name: full_name.trim(),
          organization_id: callingUser.organization_id,
        },
      }
    );

    if (inviteError) {
      console.error("Error sending invite:", inviteError);
      // User record was created, but invite failed - we should still return success
      // but notify that the invite email couldn't be sent
      return new Response(
        JSON.stringify({
          success: true,
          warning: "User created but invite email could not be sent. They may need to use password reset.",
          user_id: newUser.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the users record with the auth_user_id if we got it
    if (inviteData?.user?.id) {
      await adminClient
        .from("users")
        .update({ auth_user_id: inviteData.user.id })
        .eq("id", newUser.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation sent successfully",
        user_id: newUser.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("invite-user error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
