import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from '@/hooks/use-toast';

export const LeadCaptureTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  const [popupEnabled, setPopupEnabled] = useState(true);
  const [popupDelaySeconds, setPopupDelaySeconds] = useState(15);
  const [popupMessage, setPopupMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      setPopupEnabled(getSetting('popup_enabled', DEFAULT_SETTINGS.popup_enabled));
      setPopupDelaySeconds(getSetting('popup_delay_seconds', DEFAULT_SETTINGS.popup_delay_seconds));
      setPopupMessage(getSetting('popup_message', DEFAULT_SETTINGS.popup_message));
    }
  }, [loading, getSetting]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'popup_enabled', value: popupEnabled, category: 'lead_capture' },
        { key: 'popup_delay_seconds', value: popupDelaySeconds, category: 'lead_capture' },
        { key: 'popup_message', value: popupMessage, category: 'lead_capture' },
      ]);

      toast({ title: 'Settings saved', description: 'Lead capture settings have been updated.' });
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
          <CardTitle>Lead Capture Popup</CardTitle>
          <CardDescription>Configure the public website lead capture popup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="popupEnabled">Enable Popup</Label>
              <p className="text-sm text-muted-foreground">
                Show lead capture popup on public property pages
              </p>
            </div>
            <Switch
              id="popupEnabled"
              checked={popupEnabled}
              onCheckedChange={setPopupEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="popupDelaySeconds">Popup Delay (seconds)</Label>
            <Input
              id="popupDelaySeconds"
              type="number"
              min={0}
              max={120}
              value={popupDelaySeconds}
              onChange={(e) => setPopupDelaySeconds(parseInt(e.target.value) || 15)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Seconds to wait before showing the popup (0 = immediately)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="popupMessage">Popup Message</Label>
            <Textarea
              id="popupMessage"
              value={popupMessage}
              onChange={(e) => setPopupMessage(e.target.value)}
              rows={4}
              placeholder="Enter your custom popup message..."
            />
            <p className="text-xs text-muted-foreground">
              The message displayed in the lead capture popup
            </p>
          </div>

          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Preview</p>
            <div className="bg-background p-4 rounded border">
              <p className="text-sm">{popupMessage || 'No message set'}</p>
            </div>
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

export default LeadCaptureTab;
