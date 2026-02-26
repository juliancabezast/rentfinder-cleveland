import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, RefreshCw, Loader2, Zap } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ScoringRule {
  key: string;
  label: string;
  defaultValue: number;
  category: string;
}

const SCORING_RULES: ScoringRule[] = [
  // Showing Outcomes
  { key: 'completed_showing', label: 'Completed Showing', defaultValue: 20, category: 'Showing Outcomes' },
  { key: 'showing_confirmed', label: 'Showing Confirmed', defaultValue: 5, category: 'Showing Outcomes' },
  { key: 'showing_cancelled', label: 'Showing Cancelled', defaultValue: -10, category: 'Showing Outcomes' },
  { key: 'no_show', label: 'No Show', defaultValue: -30, category: 'Showing Outcomes' },
  // Lead Attributes
  { key: 'voucher_holder_bonus', label: 'Voucher Holder', defaultValue: 10, category: 'Lead Attributes' },
  { key: 'voucher_expiring', label: 'Voucher Expiring (<30 days)', defaultValue: 20, category: 'Lead Attributes' },
  { key: 'ready_to_move', label: 'Ready to Move', defaultValue: 15, category: 'Lead Attributes' },
  { key: 'quick_move_in_bonus', label: 'Quick Move-In', defaultValue: 5, category: 'Lead Attributes' },
  // Engagement
  { key: 'detailed_questions', label: 'Detailed Questions Asked', defaultValue: 7, category: 'Engagement' },
  { key: 'multiple_calls', label: 'Multiple Calls (2+)', defaultValue: 10, category: 'Engagement' },
  // Time Decay
  { key: 'no_contact_7_days', label: 'No Contact 7 Days', defaultValue: -8, category: 'Time Decay' },
  { key: 'no_contact_14_days', label: 'No Contact 14 Days', defaultValue: -15, category: 'Time Decay' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'Showing Outcomes': 'bg-blue-50 text-blue-700 border-blue-200',
  'Lead Attributes': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Engagement': 'bg-purple-50 text-purple-700 border-purple-200',
  'Time Decay': 'bg-amber-50 text-amber-700 border-amber-200',
};

export const ScoringTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const { userRecord } = useAuth();
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [startingScore, setStartingScore] = useState(50);
  const [priorityThreshold, setPriorityThreshold] = useState(85);
  const [ruleValues, setRuleValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading) {
      setStartingScore(getSetting('starting_score', DEFAULT_SETTINGS.starting_score));
      setPriorityThreshold(getSetting('priority_threshold', DEFAULT_SETTINGS.priority_threshold));
      const savedRules = getSetting('custom_scoring_rules', {}) as Record<string, number>;
      // Merge saved values with defaults
      const merged: Record<string, number> = {};
      for (const rule of SCORING_RULES) {
        merged[rule.key] = savedRules[rule.key] !== undefined ? savedRules[rule.key] : rule.defaultValue;
      }
      setRuleValues(merged);
    }
  }, [loading, getSetting]);

  const handleRuleChange = (key: string, value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= -100 && num <= 100) {
      setRuleValues((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleResetDefaults = () => {
    const defaults: Record<string, number> = {};
    for (const rule of SCORING_RULES) {
      defaults[rule.key] = rule.defaultValue;
    }
    setRuleValues(defaults);
    toast.success('Rules reset to defaults (save to apply)');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'starting_score', value: startingScore, category: 'scoring' },
        { key: 'priority_threshold', value: priorityThreshold, category: 'scoring' },
        { key: 'custom_scoring_rules', value: ruleValues, category: 'scoring' },
      ]);
      toast.success('Scoring settings saved');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!userRecord?.organization_id) return;
    setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('recalculate-scores', {
        body: { organization_id: userRecord.organization_id },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.success) {
        toast.success(`Recalculated scores for ${result.updated || 0} leads`);
      } else {
        toast.error(result?.error || 'Recalculation failed');
      }
    } catch (err) {
      console.error('Recalculate error:', err);
      toast.error('Failed to recalculate scores');
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  // Group rules by category
  const categories = [...new Set(SCORING_RULES.map((r) => r.category))];

  return (
    <div className="space-y-6">
      {/* Base Configuration */}
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
              Leads with a score of <strong>{priorityThreshold}</strong> or higher will be marked as priority.
              New leads start at <strong>{startingScore}</strong> points.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scoring Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Scoring Rules</CardTitle>
              <CardDescription>
                Adjust point values for each scoring event
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleResetDefaults}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Reset Defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {categories.map((category) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className={CATEGORY_COLORS[category] || ''}>
                    {category}
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {SCORING_RULES.filter((r) => r.category === category).map((rule) => {
                    const value = ruleValues[rule.key] ?? rule.defaultValue;
                    const isModified = value !== rule.defaultValue;
                    return (
                      <div
                        key={rule.key}
                        className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{rule.label}</p>
                          {isModified && (
                            <p className="text-[10px] text-muted-foreground">
                              Default: {rule.defaultValue > 0 ? '+' : ''}{rule.defaultValue}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            min={-100}
                            max={100}
                            value={value}
                            onChange={(e) => handleRuleChange(rule.key, e.target.value)}
                            className={`w-20 h-8 text-center text-sm font-mono ${
                              value > 0
                                ? 'text-emerald-700 border-emerald-200'
                                : value < 0
                                ? 'text-red-700 border-red-200'
                                : ''
                            }`}
                          />
                          <span className="text-xs text-muted-foreground w-6">pts</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="gap-2"
        >
          {recalculating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {recalculating ? 'Recalculating...' : 'Recalculate All Leads'}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
