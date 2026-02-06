import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Plus, Trash2, Mail, Bell, MessageSquare, Phone, Bot, AlertTriangle, BarChart } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPreferences } from '@/lib/notificationService';

// WhatsApp icon component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface MessageTemplate {
  name: string;
  body: string;
  channel: 'sms' | 'whatsapp' | 'both';
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export const CommunicationsTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const { userRecord } = useAuth();
  const [saving, setSaving] = useState(false);

  const [workingHoursStart, setWorkingHoursStart] = useState('09:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState('20:00');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  const [smsTemplates, setSmsTemplates] = useState<Record<string, string>>({});
  const [emailTemplates, setEmailTemplates] = useState<Record<string, string>>({});
  const [newSmsKey, setNewSmsKey] = useState('');
  const [newSmsValue, setNewSmsValue] = useState('');
  const [newEmailKey, setNewEmailKey] = useState('');
  const [newEmailValue, setNewEmailValue] = useState('');

  // Message templates (for MessagingCenter)
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [newTemplateChannel, setNewTemplateChannel] = useState<'sms' | 'whatsapp' | 'both'>('both');

  // WhatsApp settings
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappAutoSwitch, setWhatsappAutoSwitch] = useState(false);

  // Email notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFS);
  const [ownerEmail, setOwnerEmail] = useState('');

  useEffect(() => {
    if (!loading) {
      setWorkingHoursStart(getSetting('working_hours_start', DEFAULT_SETTINGS.working_hours_start));
      setWorkingHoursEnd(getSetting('working_hours_end', DEFAULT_SETTINGS.working_hours_end));
      setWorkingDays([...getSetting('working_days', DEFAULT_SETTINGS.working_days)]);
      const sms = getSetting('sms_templates', DEFAULT_SETTINGS.sms_templates);
      setSmsTemplates(typeof sms === 'object' && sms !== null ? sms as Record<string, string> : {});
      const email = getSetting('email_templates', DEFAULT_SETTINGS.email_templates);
      setEmailTemplates(typeof email === 'object' && email !== null ? email as Record<string, string> : {});
      
      // Load message templates
      const msgTemplates = getSetting('message_templates' as any, []);
      if (Array.isArray(msgTemplates)) {
        setMessageTemplates(msgTemplates as MessageTemplate[]);
      }

      // Load WhatsApp settings
      setWhatsappEnabled(getSetting('whatsapp_enabled' as any, false));
      setWhatsappAutoSwitch(getSetting('whatsapp_auto_switch_spanish' as any, false));
      
      // Load notification preferences
      const prefs = getSetting('email_notification_preferences' as any, DEFAULT_NOTIFICATION_PREFS);
      if (typeof prefs === 'object' && prefs !== null) {
        setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...prefs as NotificationPreferences });
      }
    }
  }, [loading, getSetting]);

  // Fetch owner email for default
  useEffect(() => {
    const fetchOwnerEmail = async () => {
      if (!userRecord?.organization_id) return;
      const { data } = await supabase
        .from('organizations')
        .select('owner_email')
        .eq('id', userRecord.organization_id)
        .single();
      if (data?.owner_email) {
        setOwnerEmail(data.owner_email);
        // Set as default if not already set
        if (!notificationPrefs.notification_email) {
          setNotificationPrefs(prev => ({ ...prev, notification_email: data.owner_email }));
        }
      }
    };
    fetchOwnerEmail();
  }, [userRecord?.organization_id]);

  const updateNotificationPref = (key: keyof NotificationPreferences, value: boolean | string) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: value }));
  };

  const toggleDay = (day: number) => {
    setWorkingDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const addSmsTemplate = () => {
    if (newSmsKey && newSmsValue) {
      setSmsTemplates(prev => ({ ...prev, [newSmsKey]: newSmsValue }));
      setNewSmsKey('');
      setNewSmsValue('');
    }
  };

  const removeSmsTemplate = (key: string) => {
    setSmsTemplates(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const addEmailTemplate = () => {
    if (newEmailKey && newEmailValue) {
      setEmailTemplates(prev => ({ ...prev, [newEmailKey]: newEmailValue }));
      setNewEmailKey('');
      setNewEmailValue('');
    }
  };

  const removeEmailTemplate = (key: string) => {
    setEmailTemplates(prev => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const addMessageTemplate = () => {
    if (newTemplateName && newTemplateBody) {
      setMessageTemplates(prev => [
        ...prev,
        { name: newTemplateName, body: newTemplateBody, channel: newTemplateChannel },
      ]);
      setNewTemplateName('');
      setNewTemplateBody('');
      setNewTemplateChannel('both');
    }
  };

  const removeMessageTemplate = (index: number) => {
    setMessageTemplates(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'working_hours_start', value: workingHoursStart, category: 'communications' },
        { key: 'working_hours_end', value: workingHoursEnd, category: 'communications' },
        { key: 'working_days', value: workingDays, category: 'communications' },
        { key: 'sms_templates', value: smsTemplates, category: 'communications' },
        { key: 'email_templates', value: emailTemplates, category: 'communications' },
        { key: 'message_templates', value: messageTemplates as any, category: 'communications' },
        { key: 'whatsapp_enabled', value: whatsappEnabled, category: 'communications' },
        { key: 'whatsapp_auto_switch_spanish', value: whatsappAutoSwitch, category: 'communications' },
        { key: 'email_notification_preferences', value: notificationPrefs as any, category: 'communications' },
      ]);

      toast.success('Communication settings have been updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const NOTIFICATION_TOGGLES = [
    { key: 'priority_lead' as const, label: 'Priority Lead Alerts', icon: AlertTriangle, description: 'Get notified when a high-priority lead is identified' },
    { key: 'no_show' as const, label: 'Showing No-Show Alerts', icon: Phone, description: 'Get notified when a lead misses their scheduled showing' },
    { key: 'critical_error' as const, label: 'Critical System Errors', icon: AlertTriangle, description: 'Get notified of critical system errors requiring attention' },
    { key: 'daily_summary' as const, label: 'Daily Summary', icon: BarChart, description: 'Receive a daily summary of activity', comingSoon: true },
    { key: 'score_jump' as const, label: 'Lead Score Jump (+20 points)', icon: Bot, description: 'Get notified when a lead score increases significantly' },
  ];

  if (loading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Working Hours</CardTitle>
          <CardDescription>Set when AI agents can make calls and send messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workingHoursStart">Start Time</Label>
              <Input
                id="workingHoursStart"
                type="time"
                value={workingHoursStart}
                onChange={(e) => setWorkingHoursStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingHoursEnd">End Time</Label>
              <Input
                id="workingHoursEnd"
                type="time"
                value={workingHoursEnd}
                onChange={(e) => setWorkingHoursEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Working Days</Label>
            <div className="flex flex-wrap gap-4">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={workingDays.includes(day.value)}
                    onCheckedChange={() => toggleDay(day.value)}
                  />
                  <Label htmlFor={`day-${day.value}`} className="font-normal cursor-pointer">
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMS Templates</CardTitle>
          <CardDescription>Custom SMS message templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(smsTemplates).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-sm">{key}</p>
                <p className="text-sm text-muted-foreground">{value}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSmsTemplate(key)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="border-t pt-4 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Template key (e.g., confirmation)"
                value={newSmsKey}
                onChange={(e) => setNewSmsKey(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Template message"
                  value={newSmsValue}
                  onChange={(e) => setNewSmsValue(e.target.value)}
                />
                <Button onClick={addSmsTemplate} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>Custom email templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(emailTemplates).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-sm">{key}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{value}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEmailTemplate(key)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="border-t pt-4 space-y-2">
            <Input
              placeholder="Template key (e.g., welcome)"
              value={newEmailKey}
              onChange={(e) => setNewEmailKey(e.target.value)}
            />
            <Textarea
              placeholder="Email template content..."
              value={newEmailValue}
              onChange={(e) => setNewEmailValue(e.target.value)}
              rows={3}
            />
            <Button onClick={addEmailTemplate} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Email Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Message Templates (for MessagingCenter) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Message Templates
          </CardTitle>
          <CardDescription>
            Templates for the lead messaging center. Variables: {'{name}'}, {'{property}'}, {'{date}'}, {'{time}'}, {'{link}'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messageTemplates.map((template, idx) => (
            <div key={idx} className="flex items-start gap-2 p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{template.name}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {template.channel === 'both' ? 'SMS & WhatsApp' : template.channel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{template.body}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeMessageTemplate(idx)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="border-t pt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Template name (e.g., Showing Reminder)"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
              <Select value={newTemplateChannel} onValueChange={(v) => setNewTemplateChannel(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">SMS & WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS Only</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Template message with variables like {name}, {property}..."
              value={newTemplateBody}
              onChange={(e) => setNewTemplateBody(e.target.value)}
              rows={2}
            />
            <Button onClick={addMessageTemplate} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-5 w-5 text-green-600" />
            WhatsApp Configuration
          </CardTitle>
          <CardDescription>Configure WhatsApp messaging settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label className="font-medium">Enable WhatsApp Messaging</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow sending messages via WhatsApp to leads who have consented
              </p>
            </div>
            <Switch
              checked={whatsappEnabled}
              onCheckedChange={setWhatsappEnabled}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label className="font-medium">Auto-switch for Spanish speakers</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically prefer WhatsApp when lead's preferred language is Spanish
              </p>
            </div>
            <Switch
              checked={whatsappAutoSwitch}
              onCheckedChange={setWhatsappAutoSwitch}
              disabled={!whatsappEnabled}
            />
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> Configure your WhatsApp-enabled Twilio number in Settings → Integrations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Email Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Notifications
          </CardTitle>
          <CardDescription>Configure which events trigger email alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notification Toggles */}
          <div className="space-y-4">
            {NOTIFICATION_TOGGLES.map((toggle) => {
              const Icon = toggle.icon;
              return (
                <div
                  key={toggle.key}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label className="font-medium cursor-pointer">
                          {toggle.label}
                        </Label>
                        {toggle.comingSoon && (
                          <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {toggle.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notificationPrefs[toggle.key] as boolean}
                    onCheckedChange={(checked) => updateNotificationPref(toggle.key, checked)}
                    disabled={toggle.comingSoon}
                  />
                </div>
              );
            })}
          </div>

          {/* Notification Email Input */}
          <div className="border-t pt-4 space-y-2">
            <Label htmlFor="notificationEmail">Notification Email</Label>
            <Input
              id="notificationEmail"
              type="email"
              value={notificationPrefs.notification_email || ownerEmail}
              onChange={(e) => updateNotificationPref('notification_email', e.target.value)}
              placeholder="admin@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Email address where notification alerts will be sent
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
