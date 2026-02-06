import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, Trash2, AlertTriangle, Building, Users, Phone, Calendar, BarChart3, Loader2, X, Skull, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface DemoStats {
  properties: number;
  leads: number;
  calls: number;
  showings: number;
  scoreHistory: number;
  communications: number;
}

interface DemoItem {
  id: string;
  type: 'property' | 'lead' | 'call' | 'showing';
  name: string;
  details: string;
}

export const DemoDataTab: React.FC = () => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [demoItems, setDemoItems] = useState<DemoItem[]>([]);
  
  // Demo-flagged counts (is_demo = true)
  const [stats, setStats] = useState<DemoStats>({
    properties: 0,
    leads: 0,
    calls: 0,
    showings: 0,
    scoreHistory: 0,
    communications: 0,
  });
  
  // Total org counts (all records regardless of is_demo flag)
  const [orgTotalStats, setOrgTotalStats] = useState<DemoStats>({
    properties: 0,
    leads: 0,
    calls: 0,
    showings: 0,
    scoreHistory: 0,
    communications: 0,
  });

  // Fetch demo data counts AND total org counts from database
  const fetchDemoDataCounts = useCallback(async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      const orgId = userRecord.organization_id;
      
      // Query counts for DEMO records (is_demo = true)
      const [
        propertiesDemoResult,
        leadsDemoResult,
        callsDemoResult,
        showingsDemoResult,
        scoreHistoryDemoResult,
        communicationsDemoResult,
      ] = await Promise.all([
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
        supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
        supabase.from('showings').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
        supabase.from('lead_score_history').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
        supabase.from('communications').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_demo', true),
      ]);

      // Query TOTAL counts for all records in the org (no is_demo filter)
      const [
        propertiesTotalResult,
        leadsTotalResult,
        callsTotalResult,
        showingsTotalResult,
        scoreHistoryTotalResult,
        communicationsTotalResult,
      ] = await Promise.all([
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('calls').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('showings').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('lead_score_history').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('communications').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      ]);

      setStats({
        properties: propertiesDemoResult.count || 0,
        leads: leadsDemoResult.count || 0,
        calls: callsDemoResult.count || 0,
        showings: showingsDemoResult.count || 0,
        scoreHistory: scoreHistoryDemoResult.count || 0,
        communications: communicationsDemoResult.count || 0,
      });

      setOrgTotalStats({
        properties: propertiesTotalResult.count || 0,
        leads: leadsTotalResult.count || 0,
        calls: callsTotalResult.count || 0,
        showings: showingsTotalResult.count || 0,
        scoreHistory: scoreHistoryTotalResult.count || 0,
        communications: communicationsTotalResult.count || 0,
      });

      // Fetch demo item details for the table
      await fetchDemoItemDetails();
    } catch (error) {
      console.error('Error fetching demo data counts:', error);
    } finally {
      setLoading(false);
    }
  }, [userRecord?.organization_id]);

  const fetchDemoItemDetails = async () => {
    if (!userRecord?.organization_id) return;

    const items: DemoItem[] = [];

    try {
      // Fetch demo properties
      const { data: properties } = await supabase
        .from('properties')
        .select('id, address, city, bedrooms, bathrooms, rent_price')
        .eq('organization_id', userRecord.organization_id)
        .eq('is_demo', true);

      properties?.forEach(p => {
        items.push({
          id: p.id,
          type: 'property',
          name: `${p.address}`,
          details: `${p.bedrooms}BR/${p.bathrooms}BA - $${p.rent_price}/mo`,
        });
      });

      // Fetch demo leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, full_name, phone, status, lead_score')
        .eq('organization_id', userRecord.organization_id)
        .eq('is_demo', true);

      leads?.forEach(l => {
        items.push({
          id: l.id,
          type: 'lead',
          name: l.full_name || 'Unknown',
          details: `Score: ${l.lead_score || 0} - ${l.status}`,
        });
      });

      // Fetch demo showings
      const { data: showings } = await supabase
        .from('showings')
        .select('id, scheduled_at, status, lead:leads(full_name)')
        .eq('organization_id', userRecord.organization_id)
        .eq('is_demo', true);

      showings?.forEach(s => {
        const leadName = (s.lead as any)?.full_name || 'Unknown';
        items.push({
          id: s.id,
          type: 'showing',
          name: `Showing with ${leadName}`,
          details: `${new Date(s.scheduled_at).toLocaleDateString()} - ${s.status}`,
        });
      });

      // Fetch demo calls
      const { data: calls } = await supabase
        .from('calls')
        .select('id, phone_number, duration_seconds, status')
        .eq('organization_id', userRecord.organization_id)
        .eq('is_demo', true);

      calls?.forEach(c => {
        items.push({
          id: c.id,
          type: 'call',
          name: `Call from ${c.phone_number}`,
          details: `${Math.floor((c.duration_seconds || 0) / 60)}min - ${c.status}`,
        });
      });

      setDemoItems(items);
    } catch (error) {
      console.error('Error fetching demo item details:', error);
    }
  };

  useEffect(() => {
    fetchDemoDataCounts();
  }, [fetchDemoDataCounts]);

  const removeIndividualItem = async (item: DemoItem) => {
    if (!userRecord?.organization_id) return;

    setRemovingId(item.id);
    try {
      // Delete the item based on type (delete children first to respect FK constraints)
      switch (item.type) {
        case 'property':
          await supabase.from('showings').delete().eq('property_id', item.id);
          await supabase.from('calls').delete().eq('property_id', item.id);
          await supabase.from('properties').delete().eq('id', item.id);
          break;
        case 'lead':
          await supabase.from('lead_score_history').delete().eq('lead_id', item.id);
          await supabase.from('showings').delete().eq('lead_id', item.id);
          await supabase.from('calls').delete().eq('lead_id', item.id);
          await supabase.from('communications').delete().eq('lead_id', item.id);
          await supabase.from('leads').delete().eq('id', item.id);
          break;
        case 'showing':
          await supabase.from('showings').delete().eq('id', item.id);
          break;
        case 'call':
          await supabase.from('lead_score_history').delete().eq('related_call_id', item.id);
          await supabase.from('calls').delete().eq('id', item.id);
          break;
      }

      // Refresh counts from database
      await fetchDemoDataCounts();

      toast.success(`${item.name} ha sido eliminado`);
    } catch (error) {
      console.error('Error removing item:', error);
      toast.error('No se pudo eliminar el elemento. Intenta de nuevo');
    } finally {
      setRemovingId(null);
    }
  };

  const seedDemoData = async () => {
    if (!userRecord?.organization_id) return;

    setSeeding(true);
    const orgId = userRecord.organization_id;

    try {
      // 1. Create demo property with is_demo = true
      const { data: property, error: propError } = await supabase
        .from('properties')
        .insert({
          organization_id: orgId,
          address: '1847 West 25th Street',
          unit_number: 'Unit 2',
          city: 'Cleveland',
          state: 'OH',
          zip_code: '44113',
          bedrooms: 3,
          bathrooms: 1.5,
          square_feet: 1200,
          property_type: 'duplex',
          rent_price: 1100.00,
          deposit_amount: 1100.00,
          application_fee: 50.00,
          status: 'available',
          section_8_accepted: true,
          hud_inspection_ready: true,
          description: 'Beautiful 3-bedroom duplex in Ohio City, minutes from West Side Market. Updated kitchen with stainless steel appliances, hardwood floors throughout, off-street parking included. Washer/dryer hookups in basement. Section 8 welcome.',
          special_notes: 'DEMO_DATA — This is a demo property for testing.',
          amenities: JSON.stringify(['parking', 'washer_dryer_hookup', 'hardwood_floors', 'updated_kitchen', 'basement_storage']),
          pet_policy: 'Cats allowed with $200 pet deposit. No dogs over 50 lbs.',
          photos: JSON.stringify([]),
          listed_date: new Date().toISOString().split('T')[0],
          is_demo: true,
        })
        .select()
        .single();

      if (propError) throw propError;

      // 2. Create demo lead (Maria - regular) with is_demo = true
      const { data: lead1, error: lead1Error } = await supabase
        .from('leads')
        .insert({
          organization_id: orgId,
          first_name: 'Maria',
          last_name: 'Rodriguez',
          full_name: 'Maria Rodriguez',
          phone: '+12165550101',
          email: 'demo.maria@example.com',
          preferred_language: 'es',
          source: 'inbound_call',
          source_detail: 'DEMO_DATA',
          interested_property_id: property.id,
          budget_min: 900,
          budget_max: 1200,
          move_in_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          has_voucher: true,
          voucher_amount: 1050,
          housing_authority: 'CMHA',
          voucher_status: 'active',
          status: 'engaged',
          lead_score: 72,
          is_priority: false,
          sms_consent: true,
          sms_consent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          call_consent: true,
          call_consent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          phone_verified: true,
          last_contact_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          is_demo: true,
        })
        .select()
        .single();

      if (lead1Error) throw lead1Error;

      // 3. Create demo priority lead (James) with is_demo = true
      const { data: lead2, error: lead2Error } = await supabase
        .from('leads')
        .insert({
          organization_id: orgId,
          first_name: 'James',
          last_name: 'Thompson',
          full_name: 'James Thompson',
          phone: '+12165550102',
          email: 'demo.james@example.com',
          preferred_language: 'en',
          source: 'website',
          source_detail: 'DEMO_DATA',
          interested_property_id: property.id,
          budget_min: 1000,
          budget_max: 1300,
          move_in_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          has_voucher: true,
          voucher_amount: 1150,
          housing_authority: 'CMHA',
          voucher_status: 'expiring_soon',
          status: 'qualified',
          lead_score: 91,
          is_priority: true,
          priority_reason: 'Voucher expiring in 14 days. Has deposit ready. Needs to move ASAP.',
          sms_consent: true,
          sms_consent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          call_consent: true,
          call_consent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          phone_verified: true,
          last_contact_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          is_demo: true,
        })
        .select()
        .single();

      if (lead2Error) throw lead2Error;

      // 4. Create demo call with is_demo = true
      const { data: call, error: callError } = await supabase
        .from('calls')
        .insert({
          organization_id: orgId,
          lead_id: lead1.id,
          property_id: property.id,
          direction: 'inbound',
          phone_number: '+12165550101',
          started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          ended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 1000).toISOString(),
          duration_seconds: 247,
          status: 'completed',
          transcript: `Agent: Thank you for calling Rent Finder Cleveland. This call may be recorded for quality purposes. How can I help you today?\n\nCaller: Hola, yes, hi. I'm calling about the property on West 25th Street? The three bedroom?\n\nAgent: Of course! The duplex at 1847 West 25th Street, Unit 2. It's a beautiful 3-bedroom, 1.5-bathroom unit. It's currently available at $1,100 per month. Would you like to hear more details?\n\nCaller: Yes please. Do you accept Section 8?\n\nAgent: Absolutely! We welcome Section 8 vouchers and the property is HUD inspection ready. Do you currently have an active voucher?\n\nCaller: Yes, I have a voucher from CMHA for $1,050. Would that work?\n\nAgent: That's great. With a voucher amount of $1,050, there would be a small difference of $50 that you'd cover. The property includes off-street parking and washer/dryer hookups. When are you looking to move?\n\nCaller: I need to move in about a month. My current lease ends soon.\n\nAgent: Perfect timing — the unit is available now. Can I get your name and email so we can schedule a showing?\n\nCaller: Maria Rodriguez. My email is maria.rodriguez@email.com.\n\nAgent: Thank you, Maria. Would it be okay if we follow up with you by phone or text to confirm the showing?\n\nCaller: Yes, that's fine.\n\nAgent: Wonderful. We'll reach out shortly to schedule a convenient time. Is there anything else I can help with?\n\nCaller: What about pets? I have a small cat.\n\nAgent: Cats are welcome with a $200 pet deposit. No issues there.\n\nCaller: Great, thank you!\n\nAgent: Thank you, Maria. We'll be in touch soon. Have a great day!`,
          summary: 'Spanish-speaking prospect Maria Rodriguez called about the West 25th St duplex. Has active CMHA voucher for $1,050. Interested in the 3BR unit at $1,100. Needs to move within a month. Has a cat (pets allowed). Provided contact info and consented to follow-up. Very interested and engaged throughout the call.',
          detected_language: 'es',
          sentiment: 'positive',
          key_questions: JSON.stringify([
            'Do you accept Section 8?',
            'Would my voucher amount work?',
            'When can I move in?',
            'What about pets?'
          ]),
          unanswered_questions: JSON.stringify([]),
          agent_type: 'main_inbound',
          score_change: 22,
          cost_twilio: 0.0346,
          cost_bland: 0.3705,
          cost_openai: 0.0089,
          cost_total: 0.4140,
          recording_disclosure_played: true,
          is_demo: true,
        })
        .select()
        .single();

      if (callError) throw callError;

      // 5. Create score history entries with is_demo = true
      const scoreHistoryRecords = [
        {
          organization_id: orgId,
          lead_id: lead1.id,
          previous_score: 50,
          new_score: 65,
          change_amount: 15,
          reason_code: 'voucher_active',
          reason_text: 'Lead has an active CMHA housing voucher',
          triggered_by: 'call_analysis',
          related_call_id: call.id,
          changed_by_agent: 'scoring_agent',
          is_demo: true,
        },
        {
          organization_id: orgId,
          lead_id: lead1.id,
          previous_score: 65,
          new_score: 72,
          change_amount: 7,
          reason_code: 'detailed_questions',
          reason_text: 'Lead asked 4 detailed questions about the property showing high engagement',
          triggered_by: 'call_analysis',
          related_call_id: call.id,
          changed_by_agent: 'scoring_agent',
          is_demo: true,
        },
        {
          organization_id: orgId,
          lead_id: lead2.id,
          previous_score: 50,
          new_score: 70,
          change_amount: 20,
          reason_code: 'voucher_expiring',
          reason_text: "Lead's housing voucher is expiring within 30 days — high urgency",
          triggered_by: 'call_analysis',
          changed_by_agent: 'scoring_agent',
          is_demo: true,
        },
        {
          organization_id: orgId,
          lead_id: lead2.id,
          previous_score: 70,
          new_score: 85,
          change_amount: 15,
          reason_code: 'ready_to_move',
          reason_text: 'Lead indicated they have deposit ready and need to move immediately',
          triggered_by: 'manual_update',
          changed_by_agent: 'scoring_agent',
          is_demo: true,
        },
        {
          organization_id: orgId,
          lead_id: lead2.id,
          previous_score: 85,
          new_score: 91,
          change_amount: 6,
          reason_code: 'priority_flagged',
          reason_text: 'Lead flagged as priority by system due to voucher expiration urgency',
          triggered_by: 'system',
          changed_by_agent: 'scoring_agent',
          is_demo: true,
        },
      ];

      const { error: scoreError } = await supabase
        .from('lead_score_history')
        .insert(scoreHistoryRecords);

      if (scoreError) throw scoreError;

      // 6. Create demo showing with is_demo = true
      const showingDate = new Date();
      showingDate.setDate(showingDate.getDate() + 2);
      showingDate.setHours(14, 0, 0, 0);

      const { error: showingError } = await supabase
        .from('showings')
        .insert({
          organization_id: orgId,
          lead_id: lead2.id,
          property_id: property.id,
          scheduled_at: showingDate.toISOString(),
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          is_demo: true,
        });

      if (showingError) throw showingError;

      // Refresh counts from database
      await fetchDemoDataCounts();

      toast.success('✨ Demo data seeded! — Created 1 property, 2 leads, 1 call, 1 showing, and 5 score history entries');
    } catch (error) {
      console.error('Error seeding demo data:', error);
      toast.error('Failed to seed demo data. Some records may have been created');
    } finally {
      setSeeding(false);
    }
  };

  const removeDemoData = async () => {
    if (!userRecord?.organization_id) return;

    setRemoving(true);
    const orgId = userRecord.organization_id;
    let totalDeleted = 0;

    try {
      // Delete in reverse order to respect foreign keys
      // 1. Delete score history where is_demo = true
      const { count: scoreCount } = await supabase
        .from('lead_score_history')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += scoreCount || 0;

      // 2. Delete communications where is_demo = true
      const { count: commCount } = await supabase
        .from('communications')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += commCount || 0;

      // 3. Delete showings where is_demo = true
      const { count: showingCount } = await supabase
        .from('showings')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += showingCount || 0;

      // 4. Delete calls where is_demo = true
      const { count: callCount } = await supabase
        .from('calls')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += callCount || 0;

      // 5. Delete leads where is_demo = true
      const { count: leadCount } = await supabase
        .from('leads')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += leadCount || 0;

      // 6. Delete properties where is_demo = true
      const { count: propCount } = await supabase
        .from('properties')
        .delete({ count: 'exact' })
        .eq('organization_id', orgId)
        .eq('is_demo', true);
      totalDeleted += propCount || 0;

      // Refresh counts from database
      await fetchDemoDataCounts();

      if (totalDeleted > 0) {
        toast.success(`🗑️ Se eliminaron ${totalDeleted} registros demo`);
      } else {
        toast.info('No hay datos demo para eliminar');
      }
    } catch (error) {
      console.error('Error removing demo data:', error);
      toast.error('Failed to remove all demo data');
    } finally {
      setRemoving(false);
    }
  };

  // PURGE ALL ORG DATA - deletes EVERYTHING regardless of is_demo flag
  const purgeAllOrgData = async () => {
    if (!userRecord?.organization_id) return;

    setPurging(true);
    const orgId = userRecord.organization_id;
    let totalDeleted = 0;

    try {
      // Delete in correct FK order - children first, then parents
      
      // First wave: tables with no critical FK dependencies
      const [consentResult, insightsResult, costResult, scoreResult, commResult, tasksResult] = await Promise.all([
        supabase.from('consent_log').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('investor_insights').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('cost_records').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('lead_score_history').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('communications').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('agent_tasks').delete({ count: 'exact' }).eq('organization_id', orgId),
      ]);
      totalDeleted += (consentResult.count || 0) + (insightsResult.count || 0) + (costResult.count || 0) + 
                      (scoreResult.count || 0) + (commResult.count || 0) + (tasksResult.count || 0);

      // Second wave: showings, calls, property_alerts, investor_property_access, referrals, competitor_mentions
      const [showingsResult, callsResult, alertsResult, accessResult, referralsResult, competitorResult] = await Promise.all([
        supabase.from('showings').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('calls').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('property_alerts').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('investor_property_access').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('referrals').delete({ count: 'exact' }).eq('organization_id', orgId),
        supabase.from('competitor_mentions').delete({ count: 'exact' }).eq('organization_id', orgId),
      ]);
      totalDeleted += (showingsResult.count || 0) + (callsResult.count || 0) + (alertsResult.count || 0) + 
                      (accessResult.count || 0) + (referralsResult.count || 0) + (competitorResult.count || 0);

      // Third wave: leads (after all lead-dependent records are gone)
      const { count: leadsCount } = await supabase.from('leads').delete({ count: 'exact' }).eq('organization_id', orgId);
      totalDeleted += leadsCount || 0;

      // Fourth wave: properties (after all property-dependent records are gone)
      const { count: propsCount } = await supabase.from('properties').delete({ count: 'exact' }).eq('organization_id', orgId);
      totalDeleted += propsCount || 0;

      // Finally: system_logs
      const { count: logsCount } = await supabase.from('system_logs').delete({ count: 'exact' }).eq('organization_id', orgId);
      totalDeleted += logsCount || 0;

      // Refresh counts from database
      await fetchDemoDataCounts();

      toast.success(`☠️ Purge complete — Se eliminaron ${totalDeleted} registros de tu organización`);
    } catch (error) {
      console.error('Error purging org data:', error);
      toast.error('Falló la purga. Algunos registros pueden haber sido eliminados');
    } finally {
      setPurging(false);
    }
  };

  const totalDemoCount = stats.properties + stats.leads + stats.calls + stats.showings + stats.scoreHistory + stats.communications;
  const totalOrgCount = orgTotalStats.properties + orgTotalStats.leads + orgTotalStats.calls + orgTotalStats.showings + orgTotalStats.scoreHistory + orgTotalStats.communications;
  
  // Orphan records = total - demo flagged
  const orphanStats = {
    properties: orgTotalStats.properties - stats.properties,
    leads: orgTotalStats.leads - stats.leads,
    calls: orgTotalStats.calls - stats.calls,
    showings: orgTotalStats.showings - stats.showings,
  };
  const totalOrphanCount = orphanStats.properties + orphanStats.leads + orphanStats.calls + orphanStats.showings;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const getTypeIcon = (type: DemoItem['type']) => {
    switch (type) {
      case 'property': return <Building className="h-4 w-4" />;
      case 'lead': return <Users className="h-4 w-4" />;
      case 'showing': return <Calendar className="h-4 w-4" />;
      case 'call': return <Phone className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: DemoItem['type']) => {
    switch (type) {
      case 'property': return 'Propiedad';
      case 'lead': return 'Lead';
      case 'showing': return 'Showing';
      case 'call': return 'Llamada';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Demo Data Manager
          </CardTitle>
          <CardDescription>
            Seed realistic demo data for testing. All demo data can be removed with one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Testing Only</AlertTitle>
            <AlertDescription>
              Demo data is for testing purposes only. Remove all demo data before going live with real prospects.
            </AlertDescription>
          </Alert>

          {/* Orphan Data Warning */}
          {totalOrphanCount > 0 && (
            <Alert variant="destructive" className="bg-red-50 border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>⚠️ Orphan Data Detected</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  There are <strong>{totalOrphanCount}</strong> records without the <code>is_demo</code> flag that won't be removed by "Remove All Demo Data":
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {orphanStats.properties > 0 && <li>{orphanStats.properties} unflagged properties</li>}
                  {orphanStats.leads > 0 && <li>{orphanStats.leads} unflagged leads</li>}
                  {orphanStats.calls > 0 && <li>{orphanStats.calls} unflagged calls</li>}
                  {orphanStats.showings > 0 && <li>{orphanStats.showings} unflagged showings</li>}
                </ul>
                <p className="text-sm font-medium mt-2">
                  Use "Purge ALL Org Data" below to delete everything including orphan records.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Current Status - Demo Counts */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Demo-Flagged Records (is_demo = true)</h3>
            <div className="grid gap-4 sm:grid-cols-5">
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <Building className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.properties}</p>
                  <p className="text-xs text-muted-foreground">Properties</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.leads}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.calls}</p>
                  <p className="text-xs text-muted-foreground">Calls</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.showings}</p>
                  <p className="text-xs text-muted-foreground">Showings</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.scoreHistory}</p>
                  <p className="text-xs text-muted-foreground">Score History</p>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Items Table */}
          {demoItems.length > 0 && (
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Demo Items</CardTitle>
                <CardDescription>Click the delete button to remove individual items</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demoItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {getTypeIcon(item.type)}
                            <span className="text-sm">{getTypeLabel(item.type)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.details}</TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={removingId === item.id}
                              >
                                {removingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <X className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará "{item.name}" y todos sus datos relacionados. Esta acción no se puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeIndividualItem(item)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={seedDemoData}
              disabled={seeding}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {seeding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Seed Demo Data
                </>
              )}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={removing}
                >
                  {removing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove All Demo Data
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Esto eliminará TODOS los registros demo de todas las tablas (propiedades, leads, llamadas, showings, historial de puntaje). Esta acción no se puede deshacer.
                    </p>
                    {totalOrphanCount > 0 && (
                      <p className="text-amber-600 dark:text-amber-400 font-medium">
                        ⚠️ Nota: Hay {totalOrphanCount} registros huérfanos sin el flag is_demo que NO serán eliminados. Usa "Purge ALL Org Data" si quieres eliminar todo.
                      </p>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={removeDemoData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar Todo Demo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Purge ALL Org Data Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={purging}
                  className="bg-red-900 hover:bg-red-800 text-white"
                >
                  {purging ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Purging...
                    </>
                  ) : (
                    <>
                      <Skull className="mr-2 h-4 w-4" />
                      Purge ALL Org Data
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-red-500">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                    <Skull className="h-5 w-5" />
                    ⚠️ ACCIÓN IRREVERSIBLE
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <p className="text-red-600 dark:text-red-400 font-bold">
                      Esto eliminará ABSOLUTAMENTE TODOS los registros de tu organización:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>{orgTotalStats.properties} propiedades</li>
                      <li>{orgTotalStats.leads} leads</li>
                      <li>{orgTotalStats.calls} llamadas</li>
                      <li>{orgTotalStats.showings} showings</li>
                      <li>{orgTotalStats.scoreHistory} registros de score history</li>
                      <li>{orgTotalStats.communications} comunicaciones</li>
                      <li>+ registros relacionados (consent_log, alerts, tasks, etc.)</li>
                    </ul>
                    <p className="font-bold text-red-600 dark:text-red-400">
                      Total: {totalOrgCount}+ registros serán eliminados permanentemente.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Esta acción NO SE PUEDE DESHACER. Solo los usuarios y configuración de la organización se preservarán.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={purgeAllOrgData} 
                    className="bg-red-900 text-white hover:bg-red-800"
                  >
                    Sí, PURGAR TODO
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Status Summary */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">Estado de la organización</h4>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Demo flagged:</span>
                <span className="font-medium">{totalDemoCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Orphan (sin flag):</span>
                <span className={`font-medium ${totalOrphanCount > 0 ? 'text-red-600' : ''}`}>
                  {totalOrphanCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Total organización:</span>
                <span className="font-medium">{totalOrgCount}</span>
              </div>
            </div>
            
            {totalOrgCount === 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2 mt-2">
                <CheckCircle className="h-4 w-4" />
                Tu organización está limpia. No hay registros de datos.
              </p>
            ) : totalDemoCount > 0 ? (
              <p className="text-sm text-muted-foreground mt-2">
                ✅ Demo data is currently active ({totalDemoCount} demo records). The demo property will appear in "Browse Listings" and the demo leads will appear in your lead list.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
