import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Loader2, CalendarCheck, Home, FileText, Minus, CircleDot } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Milestone scoring v1 (2026-07-19). The legacy rule-based scoring (starting
// score + tunable deltas + cron recomputes) was retired after a forensic audit
// showed it measured data-completeness and the team's own actions, not lead
// quality. Scores are now a pure function of verifiable facts, owned by the
// DB milestone engine — there is nothing to configure.

const MILESTONES = [
  {
    icon: CircleDot,
    label: 'Normal',
    points: 0,
    hot: false,
    detail: 'Every lead starts here — no milestone yet.',
    color: 'bg-slate-50 text-slate-600 border-slate-200',
  },
  {
    icon: Minus,
    label: 'Intentó',
    points: 10,
    hot: false,
    detail:
      'Had a showing booked at some point, but nothing live (no-show, cancelled, or an orphaned reschedule). Must re-book to become hot.',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: CalendarCheck,
    label: 'Agendó',
    points: 50,
    hot: true,
    detail: 'Answered and has a LIVE scheduled showing.',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    icon: Home,
    label: 'Asistió',
    points: 80,
    hot: true,
    detail: 'Attended a showing (agent report marks it completed).',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    icon: FileText,
    label: 'Aplicó',
    points: 100,
    hot: true,
    detail: 'Started a rental application (or converted).',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

export const ScoringTab: React.FC = () => {
  const { userRecord } = useAuth();
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculate = async () => {
    if (!userRecord?.organization_id) return;
    setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('recalculate-scores', {
        body: { organization_id: userRecord.organization_id },
      });
      if (error) throw error;
      toast.success(
        `Milestones recomputed: ${data?.updated ?? 0} of ${data?.total ?? 0} leads updated`
      );
    } catch (err) {
      console.error('Milestone recompute failed:', err);
      toast.error('Recompute failed. Please try again.');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">Milestone Scoring</CardTitle>
          <CardDescription>
            A lead&apos;s score is a pure function of verifiable facts — the highest milestone they
            have actually reached. No configurable rules, no decay, no automatic boosts: leads are
            <span className="font-medium"> hot only when they act</span> (book, show up, or apply).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {MILESTONES.map((m) => (
            <div
              key={m.label}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${m.color}`}
            >
              <m.icon className="h-5 w-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{m.label}</span>
                  {m.hot && (
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] h-5">
                      HOT
                    </Badge>
                  )}
                </div>
                <p className="text-xs opacity-80 mt-0.5">{m.detail}</p>
              </div>
              <span className="text-xl font-bold tabular-nums shrink-0">{m.points}</span>
            </div>
          ))}
          <p className="text-xs text-slate-500 pt-1">
            The score updates automatically the moment a showing is booked, reported, or an
            application starts. Fair Housing: the model uses behavior only — never personal
            attributes or source of income.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Recompute now</CardTitle>
          <CardDescription>
            Re-derives every lead&apos;s milestone from the current facts. Safe to run anytime —
            it only corrects drift, it never invents points.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleRecalculate}
            disabled={recalculating}
            variant="outline"
            className="border-slate-200"
          >
            {recalculating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recompute all milestones
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
