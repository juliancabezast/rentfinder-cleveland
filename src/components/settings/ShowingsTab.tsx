import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, Clock } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';

export const ShowingsTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  const [defaultDuration, setDefaultDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(15);

  useEffect(() => {
    if (!loading) {
      setDefaultDuration(getSetting('default_duration_minutes', DEFAULT_SETTINGS.default_duration_minutes));
      setBufferMinutes(getSetting('buffer_minutes', DEFAULT_SETTINGS.buffer_minutes));
    }
  }, [loading, getSetting]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'default_duration_minutes', value: defaultDuration, category: 'showings' },
        { key: 'buffer_minutes', value: bufferMinutes, category: 'showings' },
      ]);

      toast.success('Showing settings have been updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
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
          <CardTitle>Showing Defaults</CardTitle>
          <CardDescription>Configure default settings for property showings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultDuration">Default Duration (minutes)</Label>
              <Input
                id="defaultDuration"
                type="number"
                min={15}
                max={120}
                step={15}
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Default length of each showing
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bufferMinutes">Buffer Between Showings (minutes)</Label>
              <Input
                id="bufferMinutes"
                type="number"
                min={0}
                max={60}
                step={5}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 15)}
              />
              <p className="text-xs text-muted-foreground">
                Time between consecutive showings
              </p>
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-muted/50 flex items-center gap-3">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Example Schedule</p>
              <p className="text-sm text-muted-foreground">
                With {defaultDuration} min showings and {bufferMinutes} min buffer:
              </p>
              <p className="text-sm text-muted-foreground">
                10:00 AM → 10:{defaultDuration.toString().padStart(2, '0')} AM (buffer until 10:{(defaultDuration + bufferMinutes).toString().padStart(2, '0')})
              </p>
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

export default ShowingsTab;
