import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from '@/hooks/use-toast';

export const AgentsTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  // Recapture settings
  const [recaptureFirstDelay, setRecaptureFirstDelay] = useState(24);
  const [recaptureMaxAttempts, setRecaptureMaxAttempts] = useState(7);
  const [recaptureSchedule, setRecaptureSchedule] = useState('1, 2, 4, 7, 10, 14, 21');

  // Confirmation settings
  const [confirmationHoursBefore, setConfirmationHoursBefore] = useState(24);
  const [confirmationMaxAttempts, setConfirmationMaxAttempts] = useState(3);

  // No-show settings
  const [noShowDelayHours, setNoShowDelayHours] = useState(2);

  // Post-showing settings
  const [postShowingDelayHours, setPostShowingDelayHours] = useState(1);

  useEffect(() => {
    if (!loading) {
      setRecaptureFirstDelay(getSetting('recapture_first_delay_hours', DEFAULT_SETTINGS.recapture_first_delay_hours));
      setRecaptureMaxAttempts(getSetting('recapture_max_attempts', DEFAULT_SETTINGS.recapture_max_attempts));
      const schedule = getSetting('recapture_schedule', DEFAULT_SETTINGS.recapture_schedule);
      setRecaptureSchedule(Array.isArray(schedule) ? schedule.join(', ') : '1, 2, 4, 7, 10, 14, 21');
      setConfirmationHoursBefore(getSetting('confirmation_hours_before', DEFAULT_SETTINGS.confirmation_hours_before));
      setConfirmationMaxAttempts(getSetting('confirmation_max_attempts', DEFAULT_SETTINGS.confirmation_max_attempts));
      setNoShowDelayHours(getSetting('no_show_delay_hours', DEFAULT_SETTINGS.no_show_delay_hours));
      setPostShowingDelayHours(getSetting('post_showing_delay_hours', DEFAULT_SETTINGS.post_showing_delay_hours));
    }
  }, [loading, getSetting]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const scheduleArray = recaptureSchedule.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

      await updateMultipleSettings([
        { key: 'recapture_first_delay_hours', value: recaptureFirstDelay, category: 'agents' },
        { key: 'recapture_max_attempts', value: recaptureMaxAttempts, category: 'agents' },
        { key: 'recapture_schedule', value: scheduleArray, category: 'agents' },
        { key: 'confirmation_hours_before', value: confirmationHoursBefore, category: 'agents' },
        { key: 'confirmation_max_attempts', value: confirmationMaxAttempts, category: 'agents' },
        { key: 'no_show_delay_hours', value: noShowDelayHours, category: 'agents' },
        { key: 'post_showing_delay_hours', value: postShowingDelayHours, category: 'agents' },
      ]);

      toast({ title: 'Settings saved', description: 'Agent settings have been updated.' });
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
          <CardTitle>Recapture Agent</CardTitle>
          <CardDescription>Settings for the lead recapture calling agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recaptureFirstDelay">First Delay (hours)</Label>
              <Input
                id="recaptureFirstDelay"
                type="number"
                min={1}
                max={168}
                value={recaptureFirstDelay}
                onChange={(e) => setRecaptureFirstDelay(parseInt(e.target.value) || 24)}
              />
              <p className="text-xs text-muted-foreground">
                Hours to wait before first recapture attempt
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recaptureMaxAttempts">Max Attempts</Label>
              <Input
                id="recaptureMaxAttempts"
                type="number"
                min={1}
                max={20}
                value={recaptureMaxAttempts}
                onChange={(e) => setRecaptureMaxAttempts(parseInt(e.target.value) || 7)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of recapture call attempts
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recaptureSchedule">Attempt Schedule (days)</Label>
            <Input
              id="recaptureSchedule"
              value={recaptureSchedule}
              onChange={(e) => setRecaptureSchedule(e.target.value)}
              placeholder="1, 2, 4, 7, 10, 14, 21"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of days for each attempt (e.g., "1, 2, 4, 7")
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confirmation Agent</CardTitle>
          <CardDescription>Settings for the showing confirmation agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="confirmationHoursBefore">Hours Before Showing</Label>
              <Input
                id="confirmationHoursBefore"
                type="number"
                min={1}
                max={72}
                value={confirmationHoursBefore}
                onChange={(e) => setConfirmationHoursBefore(parseInt(e.target.value) || 24)}
              />
              <p className="text-xs text-muted-foreground">
                When to start confirmation calls
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmationMaxAttempts">Max Attempts</Label>
              <Input
                id="confirmationMaxAttempts"
                type="number"
                min={1}
                max={10}
                value={confirmationMaxAttempts}
                onChange={(e) => setConfirmationMaxAttempts(parseInt(e.target.value) || 3)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum confirmation attempts
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>No-Show Agent</CardTitle>
          <CardDescription>Settings for the no-show follow-up agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="noShowDelayHours">Delay After No-Show (hours)</Label>
            <Input
              id="noShowDelayHours"
              type="number"
              min={0}
              max={48}
              value={noShowDelayHours}
              onChange={(e) => setNoShowDelayHours(parseInt(e.target.value) || 2)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Hours to wait after a no-show before calling
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Post-Showing Agent</CardTitle>
          <CardDescription>Settings for the post-showing follow-up agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="postShowingDelayHours">Delay After Showing (hours)</Label>
            <Input
              id="postShowingDelayHours"
              type="number"
              min={0}
              max={48}
              value={postShowingDelayHours}
              onChange={(e) => setPostShowingDelayHours(parseInt(e.target.value) || 1)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Hours to wait after a completed showing before sending application link
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

export default AgentsTab;
