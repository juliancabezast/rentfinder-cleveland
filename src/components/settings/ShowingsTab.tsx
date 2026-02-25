import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Clock, CalendarDays } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Time options from 8:00 AM to 9:00 PM in 30-min increments
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 8; h <= 21; h++) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  TIME_OPTIONS.push({ value: `${String(h).padStart(2, '0')}:00`, label: `${display}:00 ${ampm}` });
  if (h < 21) {
    TIME_OPTIONS.push({ value: `${String(h).padStart(2, '0')}:30`, label: `${display}:30 ${ampm}` });
  }
}

type DaySchedule = { start: string; end: string } | null;
type WeeklySchedule = Record<string, DaySchedule>;

export const ShowingsTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  const [defaultDuration, setDefaultDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [schedule, setSchedule] = useState<WeeklySchedule>(
    DEFAULT_SETTINGS.showing_weekly_schedule as WeeklySchedule
  );

  useEffect(() => {
    if (!loading) {
      setDefaultDuration(getSetting('default_duration_minutes', DEFAULT_SETTINGS.default_duration_minutes));
      setBufferMinutes(getSetting('buffer_minutes', DEFAULT_SETTINGS.buffer_minutes));
      const saved = getSetting('showing_weekly_schedule', DEFAULT_SETTINGS.showing_weekly_schedule);
      if (saved && typeof saved === 'object') {
        setSchedule(saved as WeeklySchedule);
      }
    }
  }, [loading, getSetting]);

  const toggleDay = (day: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { start: '09:00', end: '17:00' },
    }));
  };

  const updateDayTime = (day: string, field: 'start' | 'end', value: string) => {
    setSchedule((prev) => {
      const current = prev[day];
      if (!current) return prev;
      return { ...prev, [day]: { ...current, [field]: value } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'default_duration_minutes', value: defaultDuration, category: 'showings' },
        { key: 'buffer_minutes', value: bufferMinutes, category: 'showings' },
        { key: 'showing_weekly_schedule', value: schedule, category: 'showings' },
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

      {/* Weekly Showing Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Weekly Showing Schedule
          </CardTitle>
          <CardDescription>
            Set which days and hours showings are available. When you enable slots for a specific date, these times will be pre-filled automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAY_NAMES.map((dayName, index) => {
              const key = String(index);
              const dayConfig = schedule[key];
              const isEnabled = dayConfig !== null && dayConfig !== undefined;

              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isEnabled ? 'bg-white border-border' : 'bg-muted/30 border-transparent'
                  }`}
                >
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleDay(key)}
                  />
                  <span className={`w-24 text-sm font-medium ${isEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {dayName}
                  </span>
                  {isEnabled && dayConfig ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Select value={dayConfig.start} onValueChange={(v) => updateDayTime(key, 'start', v)}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">to</span>
                      <Select value={dayConfig.end} onValueChange={(v) => updateDayTime(key, 'end', v)}>
                        <SelectTrigger className="w-[130px] h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.filter((t) => t.value > dayConfig.start).map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No showings</span>
                  )}
                </div>
              );
            })}
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
