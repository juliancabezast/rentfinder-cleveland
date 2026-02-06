import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, AlertTriangle } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';

export const ScoringTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  const [startingScore, setStartingScore] = useState(50);
  const [priorityThreshold, setPriorityThreshold] = useState(85);
  const [customRulesJson, setCustomRulesJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setStartingScore(getSetting('starting_score', DEFAULT_SETTINGS.starting_score));
      setPriorityThreshold(getSetting('priority_threshold', DEFAULT_SETTINGS.priority_threshold));
      const rules = getSetting('custom_scoring_rules', DEFAULT_SETTINGS.custom_scoring_rules);
      setCustomRulesJson(JSON.stringify(rules, null, 2));
    }
  }, [loading, getSetting]);

  const handleJsonChange = (value: string) => {
    setCustomRulesJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON format');
    }
  };

  const handleSave = async () => {
    if (jsonError) {
      toast.error('Please fix the JSON errors before saving');
      return;
    }

    setSaving(true);
    try {
      let customRules = {};
      try {
        customRules = JSON.parse(customRulesJson);
      } catch {
        customRules = {};
      }

      await updateMultipleSettings([
        { key: 'starting_score', value: startingScore, category: 'scoring' },
        { key: 'priority_threshold', value: priorityThreshold, category: 'scoring' },
        { key: 'custom_scoring_rules', value: customRules, category: 'scoring' },
      ]);

      toast.success('Scoring settings have been updated');
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
          <CardTitle>Lead Scoring Configuration</CardTitle>
          <CardDescription>Configure how leads are scored and prioritized</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startingScore">Starting Score</Label>
              <Input
                id="startingScore"
                type="number"
                min={0}
                max={100}
                value={startingScore}
                onChange={(e) => setStartingScore(parseInt(e.target.value) || 50)}
              />
              <p className="text-xs text-muted-foreground">
                Initial score for new leads (0-100)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priorityThreshold">Priority Threshold</Label>
              <Input
                id="priorityThreshold"
                type="number"
                min={0}
                max={100}
                value={priorityThreshold}
                onChange={(e) => setPriorityThreshold(parseInt(e.target.value) || 85)}
              />
              <p className="text-xs text-muted-foreground">
                Score at which leads become priority (0-100)
              </p>
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Leads with a score of {priorityThreshold} or higher will be marked as priority.
              New leads start at {startingScore} points.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Scoring Rules</CardTitle>
          <CardDescription>
            Advanced: Define custom scoring adjustments in JSON format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              <strong>Advanced feature:</strong> Custom scoring rules override default behavior.
              Only modify if you understand the scoring system.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customRulesJson">Custom Rules (JSON)</Label>
            <Textarea
              id="customRulesJson"
              value={customRulesJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder="{}"
            />
            {jsonError && (
              <p className="text-sm text-destructive">{jsonError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Example: {`{"voucher_holder_bonus": 10, "quick_move_in_bonus": 5}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !!jsonError}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
