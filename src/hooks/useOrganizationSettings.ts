import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

// Default settings values
export const DEFAULT_SETTINGS = {
  // Agent settings
  recapture_first_delay_hours: 24,
  recapture_max_attempts: 7,
  recapture_schedule: [1, 2, 4, 7, 10, 14, 21],
  confirmation_hours_before: 24,
  confirmation_max_attempts: 3,
  no_show_delay_hours: 2,
  post_showing_delay_hours: 1,

  // Lead capture settings
  popup_enabled: true,
  popup_delay_seconds: 15,
  popup_message: "We have an AI agent ready to help you find the perfect rental. Enter your phone number to get a call in 30 seconds!",

  // Scoring settings
  starting_score: 50,
  priority_threshold: 85,
  custom_scoring_rules: {},

  // Communications settings
  working_hours_start: "09:00",
  working_hours_end: "20:00",
  working_days: [1, 2, 3, 4, 5, 6], // Mon-Sat
  sms_templates: {},
  email_templates: {},

  // Showings settings
  default_duration_minutes: 30,
  buffer_minutes: 15,

  // Compliance settings
  recording_disclosure_text: "This call may be recorded for quality assurance and training purposes.",
  auto_purge_leads_days: 180,
  tcpa_consent_language: "By providing my phone number, I consent to receive automated calls and text messages from this service. I understand that my consent is not required to apply for housing.",

  // Voice settings
  bland_voice_id: "default",
  voice_language_primary: "en",

  // Security settings
  photo_upload_restricted: false,

  // Investor reports settings
  investor_reports_enabled: true,
  investor_reports_send_day: 1,
  investor_reports_footer: "",
} as const;

export type SettingsKey = keyof typeof DEFAULT_SETTINGS;

interface OrganizationSetting {
  id: string;
  key: string;
  value: Json;
  category: string;
  description: string | null;
}

interface UseOrganizationSettingsReturn {
  settings: Record<string, Json>;
  loading: boolean;
  error: Error | null;
  getSetting: <T>(key: SettingsKey, defaultValue?: T) => T;
  updateSetting: (key: string, value: Json, category: string, description?: string) => Promise<void>;
  updateMultipleSettings: (updates: { key: string; value: Json; category: string; description?: string }[]) => Promise<void>;
  refetch: () => Promise<void>;
}

// Cache for settings
const settingsCache: Record<string, { data: Record<string, Json>; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useOrganizationSettings(): UseOrganizationSettingsReturn {
  const { userRecord } = useAuth();
  const [settings, setSettings] = useState<Record<string, Json>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const organizationId = userRecord?.organization_id;

  const fetchSettings = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    // Check cache
    const cached = settingsCache[organizationId];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setSettings(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', organizationId);

      if (fetchError) throw fetchError;

      const settingsMap: Record<string, Json> = {};
      (data || []).forEach((setting: OrganizationSetting) => {
        settingsMap[setting.key] = setting.value;
      });

      // Update cache
      settingsCache[organizationId] = {
        data: settingsMap,
        timestamp: Date.now(),
      };

      setSettings(settingsMap);
    } catch (err) {
      console.error('Error fetching organization settings:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch settings'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = useCallback(<T,>(key: SettingsKey, defaultValue?: T): T => {
    if (key in settings) {
      return settings[key] as T;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return DEFAULT_SETTINGS[key] as T;
  }, [settings]);

  const updateSetting = useCallback(async (
    key: string,
    value: Json,
    category: string,
    description?: string
  ) => {
    if (!organizationId || !userRecord?.id) {
      throw new Error('Not authenticated');
    }

    // Check if setting exists
    const { data: existing } = await supabase
      .from('organization_settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('key', key)
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from('organization_settings')
        .update({
          value,
          category,
          description,
          updated_by: userRecord.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('organization_settings')
        .insert({
          organization_id: organizationId,
          key,
          value,
          category,
          description,
          updated_by: userRecord.id,
        });

      if (insertError) throw insertError;
    }

    // Update local state and cache
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    settingsCache[organizationId] = {
      data: newSettings,
      timestamp: Date.now(),
    };
  }, [organizationId, userRecord?.id, settings]);

  const updateMultipleSettings = useCallback(async (
    updates: { key: string; value: Json; category: string; description?: string }[]
  ) => {
    if (!organizationId || !userRecord?.id) {
      throw new Error('Not authenticated');
    }

    // Get existing settings
    const { data: existingSettings } = await supabase
      .from('organization_settings')
      .select('id, key')
      .eq('organization_id', organizationId)
      .in('key', updates.map(u => u.key));

    const existingMap = new Map((existingSettings || []).map(s => [s.key, s.id]));

    const toInsert: {
      organization_id: string;
      key: string;
      value: Json;
      category: string;
      description?: string;
      updated_by: string;
    }[] = [];

    const toUpdate: {
      id: string;
      value: Json;
      category: string;
      description?: string;
      updated_by: string;
      updated_at: string;
    }[] = [];

    updates.forEach(update => {
      const existingId = existingMap.get(update.key);
      if (existingId) {
        toUpdate.push({
          id: existingId,
          value: update.value,
          category: update.category,
          description: update.description,
          updated_by: userRecord.id,
          updated_at: new Date().toISOString(),
        });
      } else {
        toInsert.push({
          organization_id: organizationId,
          key: update.key,
          value: update.value,
          category: update.category,
          description: update.description,
          updated_by: userRecord.id,
        });
      }
    });

    // Perform updates
    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const { error } = await supabase
          .from('organization_settings')
          .update({
            value: item.value,
            category: item.category,
            description: item.description,
            updated_by: item.updated_by,
            updated_at: item.updated_at,
          })
          .eq('id', item.id);
        if (error) throw error;
      }
    }

    // Perform inserts
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('organization_settings')
        .insert(toInsert);
      if (error) throw error;
    }

    // Invalidate cache and refetch
    delete settingsCache[organizationId];
    await fetchSettings();
  }, [organizationId, userRecord?.id, fetchSettings]);

  const refetch = useCallback(async () => {
    if (organizationId) {
      delete settingsCache[organizationId];
    }
    await fetchSettings();
  }, [organizationId, fetchSettings]);

  return {
    settings,
    loading,
    error,
    getSetting,
    updateSetting,
    updateMultipleSettings,
    refetch,
  };
}
