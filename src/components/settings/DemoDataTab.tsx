import React, { useState, useEffect } from 'react';
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
import { Sparkles, Trash2, AlertTriangle, Building, Users, Phone, Calendar, BarChart3, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface DemoDataIds {
  property_ids: string[];
  lead_ids: string[];
  call_ids: string[];
  showing_ids: string[];
  score_history_ids: string[];
}

interface DemoStats {
  properties: number;
  leads: number;
  calls: number;
  showings: number;
  scoreHistory: number;
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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [demoDataIds, setDemoDataIds] = useState<DemoDataIds | null>(null);
  const [demoItems, setDemoItems] = useState<DemoItem[]>([]);
  const [stats, setStats] = useState<DemoStats>({
    properties: 0,
    leads: 0,
    calls: 0,
    showings: 0,
    scoreHistory: 0,
  });

  useEffect(() => {
    fetchDemoDataStatus();
  }, [userRecord?.organization_id]);

  const fetchDemoDataStatus = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      // Check if demo_data_ids setting exists
      const { data: setting } = await supabase
        .from('organization_settings')
        .select('value')
        .eq('organization_id', userRecord.organization_id)
        .eq('key', 'demo_data_ids')
        .single();

      if (setting?.value) {
        const ids = setting.value as unknown as DemoDataIds;
        setDemoDataIds(ids);

        // Calculate stats from stored IDs
        setStats({
          properties: ids.property_ids?.length || 0,
          leads: ids.lead_ids?.length || 0,
          calls: ids.call_ids?.length || 0,
          showings: ids.showing_ids?.length || 0,
          scoreHistory: ids.score_history_ids?.length || 0,
        });

        // Fetch detailed info for demo items
        await fetchDemoItemDetails(ids);
      } else {
        setDemoDataIds(null);
        setDemoItems([]);
        setStats({ properties: 0, leads: 0, calls: 0, showings: 0, scoreHistory: 0 });
      }
    } catch (error) {
      console.error('Error fetching demo data status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDemoItemDetails = async (ids: DemoDataIds) => {
    const items: DemoItem[] = [];

    try {
      // Fetch properties
      if (ids.property_ids?.length) {
        const { data: properties } = await supabase
          .from('properties')
          .select('id, address, city, bedrooms, bathrooms, rent_price')
          .in('id', ids.property_ids);
        
        properties?.forEach(p => {
          items.push({
            id: p.id,
            type: 'property',
            name: `${p.address}`,
            details: `${p.bedrooms}BR/${p.bathrooms}BA - $${p.rent_price}/mo`,
          });
        });
      }

      // Fetch leads
      if (ids.lead_ids?.length) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, full_name, phone, status, lead_score')
          .in('id', ids.lead_ids);
        
        leads?.forEach(l => {
          items.push({
            id: l.id,
            type: 'lead',
            name: l.full_name || 'Unknown',
            details: `Score: ${l.lead_score || 0} - ${l.status}`,
          });
        });
      }

      // Fetch showings
      if (ids.showing_ids?.length) {
        const { data: showings } = await supabase
          .from('showings')
          .select('id, scheduled_at, status, lead:leads(full_name)')
          .in('id', ids.showing_ids);
        
        showings?.forEach(s => {
          const leadName = (s.lead as any)?.full_name || 'Unknown';
          items.push({
            id: s.id,
            type: 'showing',
            name: `Showing with ${leadName}`,
            details: `${new Date(s.scheduled_at).toLocaleDateString()} - ${s.status}`,
          });
        });
      }

      // Fetch calls
      if (ids.call_ids?.length) {
        const { data: calls } = await supabase
          .from('calls')
          .select('id, phone_number, duration_seconds, status')
          .in('id', ids.call_ids);
        
        calls?.forEach(c => {
          items.push({
            id: c.id,
            type: 'call',
            name: `Call from ${c.phone_number}`,
            details: `${Math.floor((c.duration_seconds || 0) / 60)}min - ${c.status}`,
          });
        });
      }

      setDemoItems(items);
    } catch (error) {
      console.error('Error fetching demo item details:', error);
    }
  };

  const removeIndividualItem = async (item: DemoItem) => {
    if (!userRecord?.organization_id || !demoDataIds) return;

    setRemovingId(item.id);
    try {
      // Delete the item based on type
      switch (item.type) {
        case 'property':
          // First delete related data
          await supabase.from('showings').delete().eq('property_id', item.id);
          await supabase.from('calls').delete().eq('property_id', item.id);
          // Then delete the property
          await supabase.from('properties').delete().eq('id', item.id);
          demoDataIds.property_ids = demoDataIds.property_ids.filter(id => id !== item.id);
          break;
        case 'lead':
          // Delete related score history first
          await supabase.from('lead_score_history').delete().eq('lead_id', item.id);
          await supabase.from('showings').delete().eq('lead_id', item.id);
          await supabase.from('calls').delete().eq('lead_id', item.id);
          await supabase.from('communications').delete().eq('lead_id', item.id);
          // Delete lead
          await supabase.from('leads').delete().eq('id', item.id);
          demoDataIds.lead_ids = demoDataIds.lead_ids.filter(id => id !== item.id);
          break;
        case 'showing':
          await supabase.from('showings').delete().eq('id', item.id);
          demoDataIds.showing_ids = demoDataIds.showing_ids.filter(id => id !== item.id);
          break;
        case 'call':
          // Delete related score history first
          await supabase.from('lead_score_history').delete().eq('related_call_id', item.id);
          await supabase.from('calls').delete().eq('id', item.id);
          demoDataIds.call_ids = demoDataIds.call_ids.filter(id => id !== item.id);
          break;
      }

      // Update the stored IDs
      await supabase.from('organization_settings').upsert({
        organization_id: userRecord.organization_id,
        key: 'demo_data_ids',
        value: demoDataIds as unknown as Json,
        category: 'demo',
        description: 'IDs of demo data records for cleanup',
        updated_by: userRecord.id,
      });

      // Update local state
      setDemoItems(prev => prev.filter(i => i.id !== item.id));
      setStats({
        properties: demoDataIds.property_ids.length,
        leads: demoDataIds.lead_ids.length,
        calls: demoDataIds.call_ids.length,
        showings: demoDataIds.showing_ids.length,
        scoreHistory: demoDataIds.score_history_ids.length,
      });

      toast({
        title: 'Usuario eliminado exitosamente',
        description: `${item.name} ha sido eliminado.`,
      });
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el elemento. Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const seedDemoData = async () => {
    if (!userRecord?.organization_id) return;

    setSeeding(true);
    const orgId = userRecord.organization_id;
    const ids: DemoDataIds = {
      property_ids: [],
      lead_ids: [],
      call_ids: [],
      showing_ids: [],
      score_history_ids: [],
    };

    try {
      // 1. Create demo property
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
        })
        .select()
        .single();

      if (propError) throw propError;
      ids.property_ids.push(property.id);

      // 2. Create demo lead (Maria - regular)
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
        })
        .select()
        .single();

      if (lead1Error) throw lead1Error;
      ids.lead_ids.push(lead1.id);

      // 3. Create demo priority lead (James)
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
        })
        .select()
        .single();

      if (lead2Error) throw lead2Error;
      ids.lead_ids.push(lead2.id);

      // 4. Create demo call
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
        })
        .select()
        .single();

      if (callError) throw callError;
      ids.call_ids.push(call.id);

      // 5. Create score history entries
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
        },
        {
          organization_id: orgId,
          lead_id: lead2.id,
          previous_score: 70,
          new_score: 85,
          change_amount: 15,
          reason_code: 'urgency_mentioned',
          reason_text: 'Lead mentioned needing to move urgently and has deposit ready',
          triggered_by: 'call_analysis',
          changed_by_agent: 'scoring_agent',
        },
        {
          organization_id: orgId,
          lead_id: lead2.id,
          previous_score: 85,
          new_score: 91,
          change_amount: 6,
          reason_code: 'multiple_calls',
          reason_text: 'Lead called back showing continued interest in the property',
          triggered_by: 'engagement',
          changed_by_agent: 'scoring_agent',
        },
      ];

      const { data: scoreData, error: scoreError } = await supabase
        .from('lead_score_history')
        .insert(scoreHistoryRecords)
        .select();

      if (scoreError) throw scoreError;
      ids.score_history_ids = scoreData.map(s => s.id);

      // 6. Create demo showing
      const showingDate = new Date();
      showingDate.setDate(showingDate.getDate() + 2);
      showingDate.setHours(10, 0, 0, 0);

      const { data: showing, error: showingError } = await supabase
        .from('showings')
        .insert({
          organization_id: orgId,
          lead_id: lead2.id,
          property_id: property.id,
          scheduled_at: showingDate.toISOString(),
          duration_minutes: 30,
          status: 'confirmed',
          confirmation_attempts: 1,
          confirmed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (showingError) throw showingError;
      ids.showing_ids.push(showing.id);

      // 7. Create demo system logs
      await supabase.from('system_logs').insert([
        {
          organization_id: orgId,
          level: 'info',
          category: 'general',
          event_type: 'demo_data_seeded',
          message: 'Demo data was seeded successfully',
          details: { demo: true } as Json,
        },
        {
          organization_id: orgId,
          level: 'info',
          category: 'twilio',
          event_type: 'inbound_call_received',
          message: 'Inbound call received from +12165550101 (Demo)',
          details: { demo: true, phone: '+12165550101' } as Json,
          related_lead_id: lead1.id,
          related_call_id: call.id,
        },
        {
          organization_id: orgId,
          level: 'warning',
          category: 'automation',
          event_type: 'voucher_expiring_soon',
          message: 'Lead James Thompson has a voucher expiring within 14 days (Demo)',
          details: { demo: true } as Json,
          related_lead_id: lead2.id,
        },
      ]);

      // 8. Store the IDs in organization_settings
      await supabase.from('organization_settings').upsert({
        organization_id: orgId,
        key: 'demo_data_ids',
        value: ids as unknown as Json,
        category: 'demo',
        description: 'IDs of demo data records for cleanup',
        updated_by: userRecord.id,
      });

      setDemoDataIds(ids);
      setStats({
        properties: ids.property_ids.length,
        leads: ids.lead_ids.length,
        calls: ids.call_ids.length,
        showings: ids.showing_ids.length,
        scoreHistory: ids.score_history_ids.length,
      });

      // Refresh demo items list
      await fetchDemoItemDetails(ids);

      toast({
        title: '✨ Demo data seeded!',
        description: 'Created 1 property, 2 leads, 1 call, 1 showing, and 5 score history entries.',
      });
    } catch (error) {
      console.error('Error seeding demo data:', error);
      toast({
        title: 'Error',
        description: 'Failed to seed demo data. Some records may have been created.',
        variant: 'destructive',
      });
    } finally {
      setSeeding(false);
    }
  };

  const removeDemoData = async () => {
    if (!userRecord?.organization_id || !demoDataIds) return;

    setRemoving(true);
    try {
      // Delete in reverse order to respect foreign keys
      
      // 1. Delete score history
      if (demoDataIds.score_history_ids?.length) {
        await supabase
          .from('lead_score_history')
          .delete()
          .in('id', demoDataIds.score_history_ids);
      }

      // 2. Delete system logs with demo flag
      await supabase
        .from('system_logs')
        .delete()
        .eq('organization_id', userRecord.organization_id)
        .contains('details', { demo: true });

      // 3. Delete showings
      if (demoDataIds.showing_ids?.length) {
        await supabase
          .from('showings')
          .delete()
          .in('id', demoDataIds.showing_ids);
      }

      // 4. Delete calls
      if (demoDataIds.call_ids?.length) {
        await supabase
          .from('calls')
          .delete()
          .in('id', demoDataIds.call_ids);
      }

      // 5. Delete communications for demo leads
      if (demoDataIds.lead_ids?.length) {
        await supabase
          .from('communications')
          .delete()
          .in('lead_id', demoDataIds.lead_ids);
      }

      // 6. Delete leads
      if (demoDataIds.lead_ids?.length) {
        await supabase
          .from('leads')
          .delete()
          .in('id', demoDataIds.lead_ids);
      }

      // 7. Delete properties
      if (demoDataIds.property_ids?.length) {
        await supabase
          .from('properties')
          .delete()
          .in('id', demoDataIds.property_ids);
      }

      // 8. Remove the setting
      await supabase
        .from('organization_settings')
        .delete()
        .eq('organization_id', userRecord.organization_id)
        .eq('key', 'demo_data_ids');

      setDemoDataIds(null);
      setDemoItems([]);
      setStats({ properties: 0, leads: 0, calls: 0, showings: 0, scoreHistory: 0 });

      toast({
        title: '🗑️ Demo data removed',
        description: 'All demo records have been deleted.',
      });
    } catch (error) {
      console.error('Error removing demo data:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove all demo data.',
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  };

  const hasData = demoDataIds !== null;

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

          {/* Current Status */}
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
              disabled={hasData || seeding}
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
                  disabled={!hasData || removing}
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
                  <AlertDialogTitle>Remove All Demo Data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all demo properties, leads, calls, showings, and related records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={removeDemoData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remove All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {hasData && (
            <p className="text-sm text-muted-foreground">
              ✅ Demo data is currently active. The demo property will appear in "Browse Listings" and the demo leads will appear in your lead list.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DemoDataTab;
