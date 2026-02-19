import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AuthContextType, UserRecord, Organization } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const fetchUserRecord = useCallback(async (authUser: SupabaseUser) => {
    const authUserId = authUser.id;
    const authEmail = authUser.email;
    
    try {
      setProfileLoading(true);
      
      // Step 1: Try to get profile by auth_user_id
      let { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (userError) {
        console.error('Error fetching user record by auth_user_id:', userError);
      }

      // Step 2: If no profile found, try matching by ID directly (for older records)
      if (!userData) {
        const { data: byId, error: idError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUserId)
          .eq('is_active', true)
          .maybeSingle();

        if (idError) {
          console.error('Error fetching user record by id:', idError);
        }
        userData = byId;
      }

      // Step 3: If still no profile, try matching by email
      if (!userData && authEmail) {
        const { data: byEmail, error: emailError } = await supabase
          .from('users')
          .select('*')
          .eq('email', authEmail)
          .eq('is_active', true)
          .maybeSingle();

        if (emailError) {
          console.error('Error fetching user record by email:', emailError);
        }
        userData = byEmail;
      }

      // Step 4: If still no profile, sign out — user was likely deleted
      if (!userData) {
        console.error('No user profile found. User may have been deleted. Signing out.');
        await supabase.auth.signOut();
        setUserRecord(null);
        setLoading(false);
        return;
      }

      if (userData) {
        retryCountRef.current = 0; // Reset retry count on success
        setUserRecord(userData as UserRecord);

        // Update last_login_at
        supabase
          .from('users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', userData.id)
          .then(() => {});

        // Fetch organization if user has one
        if (userData.organization_id) {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('id, name, slug, logo_url, primary_color, accent_color, timezone, default_language, plan, subscription_status, is_active')
            .eq('id', userData.organization_id)
            .maybeSingle();

          if (orgError) {
            console.error('Error fetching organization:', orgError);
          } else if (orgData) {
            setOrganization(orgData as Organization);
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchUserRecord:', error);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Use setTimeout to prevent potential deadlocks with Supabase client
          setTimeout(() => {
            fetchUserRecord(currentSession.user);
          }, 0);
        } else {
          setUserRecord(null);
          setOrganization(null);
        }

        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        fetchUserRecord(currentSession.user);
      }
      
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserRecord]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName,
          },
        },
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserRecord(null);
    setOrganization(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const value: AuthContextType = {
    user,
    userRecord,
    organization,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
