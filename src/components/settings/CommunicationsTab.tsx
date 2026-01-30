import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Save, Plus, Trash2 } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from '@/hooks/use-toast';

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

  useEffect(() => {
    if (!loading) {
      setWorkingHoursStart(getSetting('working_hours_start', DEFAULT_SETTINGS.working_hours_start));
      setWorkingHoursEnd(getSetting('working_hours_end', DEFAULT_SETTINGS.working_hours_end));
      setWorkingDays([...getSetting('working_days', DEFAULT_SETTINGS.working_days)]);
      const sms = getSetting('sms_templates', DEFAULT_SETTINGS.sms_templates);
      setSmsTemplates(typeof sms === 'object' && sms !== null ? sms as Record<string, string> : {});
      const email = getSetting('email_templates', DEFAULT_SETTINGS.email_templates);
      setEmailTemplates(typeof email === 'object' && email !== null ? email as Record<string, string> : {});
    }
  }, [loading, getSetting]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'working_hours_start', value: workingHoursStart, category: 'communications' },
        { key: 'working_hours_end', value: workingHoursEnd, category: 'communications' },
        { key: 'working_days', value: workingDays, category: 'communications' },
        { key: 'sms_templates', value: smsTemplates, category: 'communications' },
        { key: 'email_templates', value: emailTemplates, category: 'communications' },
      ]);

      toast({ title: 'Settings saved', description: 'Communication settings have been updated.' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default CommunicationsTab;
