import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Eye, EyeOff, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface IntegrationKey {
  key: string;
  label: string;
  description: string;
  testable: boolean;
  isSecretEnv?: boolean; // Stored in Supabase secrets, not organization_credentials
}

const INTEGRATION_KEYS: IntegrationKey[] = [
  {
    key: 'twilio_account_sid',
    label: 'Twilio Account SID',
    description: 'Your Twilio account identifier',
    testable: false,
  },
  {
    key: 'twilio_auth_token',
    label: 'Twilio Auth Token',
    description: 'Your Twilio authentication token',
    testable: true,
  },
  {
    key: 'twilio_phone_number',
    label: 'Twilio Phone Number',
    description: 'Your Twilio phone number for SMS (e.g., +12165550100)',
    testable: false,
  },
  {
    key: 'twilio_whatsapp_number',
    label: 'Twilio WhatsApp Number',
    description: 'Your Twilio WhatsApp-enabled number (e.g., +12165550100)',
    testable: false,
  },
  {
    key: 'bland_api_key',
    label: 'Bland.ai API Key',
    description: 'API key for Bland.ai voice agents',
    testable: true,
  },
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    description: 'API key for lead scoring and insights',
    testable: true,
  },
  {
    key: 'persona_api_key',
    label: 'Persona API Key',
    description: 'API key for identity verification',
    testable: true,
  },
  {
    key: 'doorloop_api_key',
    label: 'Doorloop API Key',
    description: 'API key for property management sync',
    testable: true,
  },
  {
    key: 'resend_api_key',
    label: 'Resend API Key',
    description: 'API key for sending email notifications',
    testable: true,
  },
];

// Map integration key names to service identifiers
const mapKeyToService = (key: string): string => {
  const map: Record<string, string> = {
    twilio_account_sid: "twilio",
    twilio_auth_token: "twilio",
    twilio_phone_number: "twilio",
    twilio_whatsapp_number: "twilio",
    bland_api_key: "bland_ai",
    openai_api_key: "openai",
    persona_api_key: "persona",
    doorloop_api_key: "doorloop",
    resend_api_key: "resend",
  };
  return map[key] || key;
};

interface TestStatus {
  success: boolean;
  testedAt: string;
}

export const IntegrationKeysTab: React.FC = () => {
  const { userRecord } = useAuth();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!userRecord?.organization_id) return;

      try {
        // Fetch credentials and test statuses in parallel
        const [credsResult, logsResult] = await Promise.all([
          supabase
            .from('organization_credentials')
            .select('*')
            .eq('organization_id', userRecord.organization_id)
            .single(),
          supabase
            .from('integration_health')
            .select('*')
            .eq('organization_id', userRecord.organization_id),
        ]);

        if (credsResult.error && credsResult.error.code !== 'PGRST116') throw credsResult.error;

        if (credsResult.data) {
          const creds: Record<string, string> = {};
          INTEGRATION_KEYS.forEach((key) => {
            if (key.isSecretEnv) return; // Skip env secrets
            const value = credsResult.data[key.key as keyof typeof credsResult.data];
            if (value && typeof value === 'string') {
              creds[key.key] = value;
            }
          });
          setCredentials(creds);
        }

        // Parse test statuses from integration_health
        const statuses: Record<string, TestStatus> = {};
        const serviceToKeys: Record<string, string[]> = {
          twilio: ['twilio_account_sid', 'twilio_auth_token'],
          bland_ai: ['bland_api_key'],
          openai: ['openai_api_key'],
          persona: ['persona_api_key'],
          doorloop: ['doorloop_api_key'],
          resend: ['resend_api_key'],
        };
        (logsResult.data || []).forEach((row: any) => {
          const keys = serviceToKeys[row.service];
          if (keys) {
            keys.forEach((key) => {
              statuses[key] = {
                success: row.status === 'healthy',
                testedAt: row.last_checked_at,
              };
            });
          }
        });
        setTestStatuses(statuses);
      } catch (error) {
        console.error('Error fetching credentials:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCredentials();
  }, [userRecord?.organization_id]);

  const maskValue = (value: string | undefined) => {
    if (!value) return '••••••••';
    if (value.length <= 4) return '••••' + value;
    return '••••••••' + value.slice(-4);
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const startEditing = (key: string) => {
    setEditingKeys((prev) => new Set(prev).add(key));
    setNewValues((prev) => ({ ...prev, [key]: '' }));
  };

  const cancelEditing = (key: string) => {
    setEditingKeys((prev) => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
    setNewValues((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const saveKey = async (key: string) => {
    if (!userRecord?.organization_id || !newValues[key]) return;

    setSaving(key);
    try {
      // Check if credentials record exists
      const { data: existing } = await supabase
        .from('organization_credentials')
        .select('id')
        .eq('organization_id', userRecord.organization_id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('organization_credentials')
          .update({
            [key]: newValues[key],
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', userRecord.organization_id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_credentials')
          .insert({
            organization_id: userRecord.organization_id,
            [key]: newValues[key],
          });

        if (error) throw error;
      }

      setCredentials((prev) => ({ ...prev, [key]: newValues[key] }));
      cancelEditing(key);
      toast.success('Integration key has been updated');
    } catch (error) {
      console.error('Error saving key:', error);
      toast.error('Failed to save key');
    } finally {
      setSaving(null);
    }
  };

  const testConnection = async (key: string) => {
    setTesting(key);
    try {
      const service = mapKeyToService(key);
      
      // Use edge function for real testing
      const { data, error } = await supabase.functions.invoke('test-integration', {
        body: { service, organization_id: userRecord?.organization_id },
      });

      if (error) throw error;

      // Update local test status
      setTestStatuses((prev) => ({
        ...prev,
        [key]: { success: data.success, testedAt: new Date().toISOString() },
      }));

      if (data.success) {
        toast.success(`✅ Connection successful — ${data.message}`);
      } else {
        toast.error(`❌ Connection failed — ${data.message}`);
      }
    } catch (error) {
      console.error('Test connection error:', error);
      toast.error(error instanceof Error ? error.message : 'Connection test failed');
    } finally {
      setTesting(null);
    }
  };

  const getStatusIndicator = (key: string) => {
    const status = testStatuses[key];
    if (!status) return null;
    
    return (
      <span className={`w-2 h-2 rounded-full ${status.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
    );
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-700 dark:text-yellow-400">
          <strong>Security Warning:</strong> Never share your API keys with anyone.
          These keys provide access to your integration accounts and should be kept confidential.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration API Keys</CardTitle>
          <CardDescription>
            Configure API keys for third-party service integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {INTEGRATION_KEYS.map((integration) => (
            <div key={integration.key} className="space-y-2 pb-4 border-b last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-2">
                          {getStatusIndicator(integration.key)}
                          <Label htmlFor={integration.key} className="cursor-pointer">
                            {integration.label}
                          </Label>
                        </span>
                      </TooltipTrigger>
                      {testStatuses[integration.key] && (
                        <TooltipContent>
                          <p className="text-xs">
                            {testStatuses[integration.key].success ? '✅ Connected' : '❌ Failed'}
                            <br />
                            Tested {formatDistanceToNow(new Date(testStatuses[integration.key].testedAt), { addSuffix: true })}
                          </p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  {integration.isSecretEnv && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">ENV</span>
                  )}
                </div>
                {credentials[integration.key] && !editingKeys.has(integration.key) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleVisibility(integration.key)}
                  >
                    {visibleKeys.has(integration.key) ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{integration.description}</p>

              {editingKeys.has(integration.key) ? (
                <div className="flex gap-2">
                  <Input
                    id={integration.key}
                    type="password"
                    value={newValues[integration.key] || ''}
                    onChange={(e) =>
                      setNewValues((prev) => ({ ...prev, [integration.key]: e.target.value }))
                    }
                    placeholder="Enter new key..."
                  />
                  <Button
                    size="icon"
                    onClick={() => saveKey(integration.key)}
                    disabled={saving === integration.key}
                  >
                    {saving === integration.key ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => cancelEditing(integration.key)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={
                      visibleKeys.has(integration.key)
                        ? credentials[integration.key] || ''
                        : maskValue(credentials[integration.key])
                    }
                    disabled
                    className="bg-muted"
                  />
                  <Button variant="outline" onClick={() => startEditing(integration.key)}>
                    Update
                  </Button>
                  {integration.testable && credentials[integration.key] && (
                    <Button
                      variant="outline"
                      onClick={() => testConnection(integration.key)}
                      disabled={testing === integration.key}
                    >
                      {testing === integration.key ? 'Testing...' : 'Test'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
