import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];

export interface UserRecord {
  id: string;
  auth_user_id: string | null;
  organization_id: string | null;
  email: string;
  full_name: string;
  role: AppRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  commission_rate: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  timezone: string | null;
  default_language: string | null;
  plan: string;
  subscription_status: string;
  is_active: boolean | null;
}

export interface AuthContextType {
  user: SupabaseUser | null;
  userRecord: UserRecord | null;
  organization: Organization | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}
