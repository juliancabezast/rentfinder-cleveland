import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoUpload } from './PhotoUpload';
import { AlternativePropertiesSelector } from './AlternativePropertiesSelector';
import { Loader2, Sparkles, Globe, Check, X, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const propertySchema = z.object({
  address: z.string().min(1, 'Address is required'),
  unit_number: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip_code: z.string().min(5, 'Valid ZIP code is required'),
  bedrooms: z.coerce.number().min(0, 'Bedrooms must be 0 or more'),
  bathrooms: z.coerce.number().min(0, 'Bathrooms must be 0 or more'),
  square_feet: z.coerce.number().optional(),
  property_type: z.string().optional(),
  rent_price: z.coerce.number().min(1, 'Rent price is required'),
  deposit_amount: z.coerce.number().optional(),
  application_fee: z.coerce.number().optional(),
  status: z.string(),
  coming_soon_date: z.string().optional(),
  section_8_accepted: z.boolean(),
  hud_inspection_ready: z.boolean(),
  video_tour_url: z.string().url().optional().or(z.literal('')),
  virtual_tour_url: z.string().url().optional().or(z.literal('')),
  description: z.string().optional(),
  special_notes: z.string().optional(),
  pet_policy: z.string().optional(),
  investor_id: z.string().optional(),
});

type PropertyFormData = z.infer<typeof propertySchema>;

const amenitiesList = [
  { id: 'washer_dryer', label: 'Washer/Dryer' },
  { id: 'dishwasher', label: 'Dishwasher' },
  { id: 'ac', label: 'A/C' },
  { id: 'heating', label: 'Heating' },
  { id: 'parking', label: 'Parking' },
  { id: 'garage', label: 'Garage' },
  { id: 'fenced_yard', label: 'Fenced Yard' },
  { id: 'pets_allowed', label: 'Pets Allowed' },
  { id: 'pool', label: 'Pool' },
  { id: 'gym', label: 'Gym' },
  { id: 'storage', label: 'Storage' },
  { id: 'hardwood_floors', label: 'Hardwood Floors' },
];

interface Property {
  id: string;
  address: string;
  unit_number?: string | null;
  city: string;
  state: string;
  zip_code: string;
  bedrooms: number;
  bathrooms: number;
  square_feet?: number | null;
  property_type?: string | null;
  rent_price: number;
  deposit_amount?: number | null;
  application_fee?: number | null;
  status: string;
  coming_soon_date?: string | null;
  section_8_accepted?: boolean | null;
  hud_inspection_ready?: boolean | null;
  photos?: string[] | null;
  video_tour_url?: string | null;
  virtual_tour_url?: string | null;
  description?: string | null;
  special_notes?: string | null;
  amenities?: string[] | null;
  pet_policy?: string | null;
  alternative_property_ids?: string[] | null;
  investor_id?: string | null;
}

interface PropertyFormProps {
  property?: Property | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({
  property,
  onSuccess,
  onCancel,
}) => {
  const { organization } = useAuth();
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(property?.photos) ? property.photos : []
  );
  const [amenities, setAmenities] = useState<string[]>(
    Array.isArray(property?.amenities) ? property.amenities : []
  );
  const [alternativePropertyIds, setAlternativePropertyIds] = useState<string[]>(
    Array.isArray(property?.alternative_property_ids) ? property.alternative_property_ids : []
  );
  const [availableProperties, setAvailableProperties] = useState<Property[]>([]);
  const [investors, setInvestors] = useState<{ id: string; full_name: string }[]>([]);

  // AI generation states
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [generatingPetPolicy, setGeneratingPetPolicy] = useState(false);

  // Zillow re-sync states (edit mode only)
  const [zillowUrl, setZillowUrl] = useState('');
  const [zillowLoading, setZillowLoading] = useState(false);
  const [zillowChanges, setZillowChanges] = useState<Record<string, { current: string; incoming: string }> | null>(null);
  const [zillowApprovals, setZillowApprovals] = useState<Record<string, boolean>>({});

  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      address: property?.address || '',
      unit_number: property?.unit_number || '',
      city: property?.city || 'Cleveland',
      state: property?.state || 'OH',
      zip_code: property?.zip_code || '',
      bedrooms: property?.bedrooms || 0,
      bathrooms: property?.bathrooms || 1,
      square_feet: property?.square_feet || undefined,
      property_type: property?.property_type || '',
      rent_price: property?.rent_price || 0,
      deposit_amount: property?.deposit_amount || undefined,
      application_fee: property?.application_fee || undefined,
      status: property?.status || 'available',
      coming_soon_date: property?.coming_soon_date || '',
      section_8_accepted: property?.section_8_accepted ?? true,
      hud_inspection_ready: property?.hud_inspection_ready ?? true,
      video_tour_url: property?.video_tour_url || '',
      virtual_tour_url: property?.virtual_tour_url || '',
      description: property?.description || '',
      special_notes: property?.special_notes || '',
      pet_policy: property?.pet_policy || '',
      investor_id: property?.investor_id || '',
    },
  });

  const watchStatus = form.watch('status');

  useEffect(() => {
    const fetchData = async () => {
      if (!organization?.id) return;

      // Fetch other properties for alternatives
      const { data: propertiesData } = await supabase
        .from('properties')
        .select('id, address, unit_number, city, rent_price, bedrooms, status')
        .eq('organization_id', organization.id)
        .in('status', ['available', 'coming_soon']);

      if (propertiesData) {
        setAvailableProperties(propertiesData as Property[]);
      }

      // Fetch investors (viewers)
      const { data: investorsData } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('organization_id', organization.id)
        .eq('role', 'viewer')
        .eq('is_active', true);

      if (investorsData) {
        setInvestors(investorsData);
      }
    };

    fetchData();
  }, [organization?.id]);

  const toggleAmenity = (amenityId: string) => {
    setAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((a) => a !== amenityId)
        : [...prev, amenityId]
    );
  };

  const getPropertyContext = () => ({
    address: form.getValues('address'),
    city: form.getValues('city'),
    state: form.getValues('state'),
    zip_code: form.getValues('zip_code'),
    bedrooms: form.getValues('bedrooms') || 'unknown',
    bathrooms: form.getValues('bathrooms') || 'unknown',
    sqft: form.getValues('square_feet') || 'unknown',
    property_type: form.getValues('property_type') || 'unknown',
    rent_price: form.getValues('rent_price') || 'unknown',
    pet_policy: form.getValues('pet_policy') || 'not specified',
    section_8: form.getValues('section_8_accepted') ? 'accepted' : 'not accepted',
    hud_ready: form.getValues('hud_inspection_ready') ? 'yes' : 'no',
    amenities: amenities.map(a => amenitiesList.find(al => al.id === a)?.label || a).join(', ') || 'none listed',
  });

  const callOpenAi = async (systemPrompt: string, userPrompt: string): Promise<string | null> => {
    if (!organization?.id) return null;

    const { data: creds } = await supabase
      .from('organization_credentials')
      .select('openai_api_key')
      .eq('organization_id', organization.id)
      .single();

    if (!creds?.openai_api_key) {
      toast.error('OpenAI API key not configured. Add it in Settings → Integrations.');
      return null;
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.openai_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  };

  const generateAiDescription = async () => {
    setGeneratingDesc(true);
    try {
      const result = await callOpenAi(
        `You are writing a concise rental property description optimized for AI agents that handle inbound calls and lead management. The description must:
1. Lead with the most important details: rent, beds/baths, key features
2. Be concise (3-4 sentences max)
3. Include Section 8/voucher status clearly
4. Mention pet policy if available
5. Highlight move-in readiness and standout amenities
6. Use a professional, informative tone (not marketing fluff)
7. Write in English only
Return ONLY the description text, no quotes or labels.`,
        `Generate an AI-optimized property description:\n${JSON.stringify(getPropertyContext())}`
      );
      if (result) form.setValue('description', result);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const generateAiNotes = async () => {
    setGeneratingNotes(true);
    try {
      const result = await callOpenAi(
        `You generate internal notes for a property management team. These notes are NOT visible to tenants. Include:
1. Key selling points for agents to mention on calls
2. Potential objections and how to handle them
3. Comparative market positioning (is the rent competitive for the area?)
4. Any red flags or things to watch for
5. Tips for showing the property
Be direct and concise (4-6 bullet points). Write in English only.
Return ONLY the notes text, no quotes or labels.`,
        `Generate internal team notes for this property:\n${JSON.stringify(getPropertyContext())}`
      );
      if (result) form.setValue('special_notes', result);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGeneratingNotes(false);
    }
  };

  const generateAiPetPolicy = async () => {
    setGeneratingPetPolicy(true);
    try {
      const result = await callOpenAi(
        `You generate a clear, professional pet policy for a rental property listing. The policy should:
1. Clearly state which pets are allowed (cats, dogs, small pets)
2. Include any weight/breed restrictions if applicable for the property type
3. Mention pet deposit or pet rent if typical for the area
4. Be concise (2-3 sentences max)
5. Write in English only
Return ONLY the pet policy text, no quotes or labels. If no specific pet information is available, generate a reasonable default policy for the property type.`,
        `Generate a pet policy for this property:\n${JSON.stringify(getPropertyContext())}`
      );
      if (result) form.setValue('pet_policy', result);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGeneratingPetPolicy(false);
    }
  };

  const fieldLabels: Record<string, string> = {
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    square_feet: 'Sq Ft',
    rent_price: 'Monthly Rent',
    property_type: 'Property Type',
    pet_policy: 'Pet Policy',
    description: 'Description',
    deposit_amount: 'Security Deposit',
    application_fee: 'Application Fee',
  };

  const handleZillowSync = async () => {
    if (!zillowUrl.trim() || !organization?.id) return;
    if (!zillowUrl.includes('zillow.com')) {
      toast.error('Please enter a valid Zillow URL.');
      return;
    }

    setZillowLoading(true);
    setZillowChanges(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('import-zillow-property', {
        body: { zillow_url: zillowUrl.trim(), organization_id: organization.id },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.property) throw new Error('No property data returned');

      const incoming = data.property;
      const current = form.getValues();

      // Compare fields and find differences
      const changes: Record<string, { current: string; incoming: string }> = {};
      const fieldsToCompare: { key: string; formKey: keyof PropertyFormData; format?: (v: any) => string }[] = [
        { key: 'bedrooms', formKey: 'bedrooms' },
        { key: 'bathrooms', formKey: 'bathrooms' },
        { key: 'square_feet', formKey: 'square_feet' },
        { key: 'rent_price', formKey: 'rent_price' },
        { key: 'property_type', formKey: 'property_type' },
        { key: 'deposit_amount', formKey: 'deposit_amount' },
        { key: 'application_fee', formKey: 'application_fee' },
        { key: 'description', formKey: 'description' },
        { key: 'pet_policy', formKey: 'pet_policy' },
      ];

      for (const { key, formKey } of fieldsToCompare) {
        const incomingVal = incoming[key];
        const currentVal = current[formKey];

        if (incomingVal != null && incomingVal !== '' && incomingVal !== 0) {
          const inStr = String(incomingVal);
          const curStr = String(currentVal || '');
          if (inStr !== curStr) {
            changes[formKey] = { current: curStr || '(empty)', incoming: inStr };
          }
        }
      }

      if (Object.keys(changes).length === 0) {
        toast.success('No differences found — property is up to date.');
      } else {
        setZillowChanges(changes);
        const approvals: Record<string, boolean> = {};
        for (const key of Object.keys(changes)) approvals[key] = true;
        setZillowApprovals(approvals);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setZillowLoading(false);
    }
  };

  const applyZillowChanges = () => {
    if (!zillowChanges) return;

    for (const [key, { incoming }] of Object.entries(zillowChanges)) {
      if (zillowApprovals[key]) {
        const numericFields = ['bedrooms', 'bathrooms', 'square_feet', 'rent_price', 'deposit_amount', 'application_fee'];
        if (numericFields.includes(key)) {
          form.setValue(key as keyof PropertyFormData, parseFloat(incoming) as any);
        } else {
          form.setValue(key as keyof PropertyFormData, incoming as any);
        }
      }
    }

    setZillowChanges(null);
    setZillowApprovals({});
    setZillowUrl('');
    toast.success('Selected changes applied to form.');
  };

  const onSubmit = async (data: PropertyFormData) => {
    if (!organization?.id) {
      toast.error('Organization not found');
      return;
    }

    setSaving(true);

    try {
      const propertyData: any = {
        address: data.address,
        unit_number: data.unit_number || null,
        city: data.city,
        state: data.state,
        zip_code: data.zip_code,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        square_feet: data.square_feet || null,
        property_type: data.property_type || null,
        rent_price: data.rent_price,
        deposit_amount: data.deposit_amount || null,
        application_fee: data.application_fee || null,
        status: data.status,
        coming_soon_date: data.status === 'coming_soon' ? data.coming_soon_date : null,
        section_8_accepted: data.section_8_accepted,
        hud_inspection_ready: data.hud_inspection_ready,
        video_tour_url: data.video_tour_url || null,
        virtual_tour_url: data.virtual_tour_url || null,
        description: data.description || null,
        special_notes: data.special_notes || null,
        pet_policy: data.pet_policy || null,
        investor_id: data.investor_id || null,
        organization_id: organization.id,
        photos: photos,
        amenities: amenities,
        alternative_property_ids: alternativePropertyIds,
      };

      if (property?.id) {
        // Update
        const { error } = await supabase
          .from('properties')
          .update(propertyData)
          .eq('id', property.id);

        if (error) throw error;
        toast.success('Property updated successfully');
      } else {
        // Create
        const { error } = await supabase
          .from('properties')
          .insert(propertyData);

        if (error) throw error;
        toast.success('Property created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Zillow Re-sync (edit mode only) */}
        {property?.id && (
          <Card className="border-[#370d4b]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#370d4b]" />
                Sync from Zillow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.zillow.com/homedetails/..."
                  value={zillowUrl}
                  onChange={(e) => setZillowUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleZillowSync(); } }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleZillowSync}
                  disabled={!zillowUrl.trim() || zillowLoading}
                  className="shrink-0"
                >
                  {zillowLoading ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Checking...</>
                  ) : (
                    'Check for Updates'
                  )}
                </Button>
              </div>

              {/* Zillow variance popup */}
              {zillowChanges && Object.keys(zillowChanges).length > 0 && (
                <div className="rounded-lg border border-[#370d4b]/30 bg-[#370d4b]/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#370d4b] flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {Object.keys(zillowChanges).length} difference{Object.keys(zillowChanges).length > 1 ? 's' : ''} found
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setZillowChanges(null); setZillowApprovals({}); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(zillowChanges).map(([key, { current, incoming }]) => {
                      const label = fieldLabels[key] || key;
                      const isMonetary = ['rent_price', 'deposit_amount', 'application_fee'].includes(key);
                      const displayCurrent = isMonetary && current !== '(empty)' ? `$${current}` : current;
                      const displayIncoming = isMonetary ? `$${incoming}` : incoming;
                      const truncCurrent = displayCurrent.length > 40 ? displayCurrent.substring(0, 40) + '...' : displayCurrent;
                      const truncIncoming = displayIncoming.length > 40 ? displayIncoming.substring(0, 40) + '...' : displayIncoming;

                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/70">
                          <Checkbox
                            checked={zillowApprovals[key] ?? true}
                            onCheckedChange={(v) =>
                              setZillowApprovals((prev) => ({ ...prev, [key]: v === true }))
                            }
                          />
                          <span className="text-sm font-medium w-28 shrink-0">{label}</span>
                          <div className="flex items-center gap-2 text-sm min-w-0">
                            <span className="text-muted-foreground line-through truncate">{truncCurrent}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-[#370d4b] font-medium truncate">{truncIncoming}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setZillowChanges(null); setZillowApprovals({}); }}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyZillowChanges}
                      className="bg-[#370d4b] hover:bg-[#370d4b]/90 text-white"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Apply Selected
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Street Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unit_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Apt 2B" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State *</FormLabel>
                  <FormControl>
                    <Input maxLength={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zip_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="44101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Property Details */}
        <Card>
          <CardHeader>
            <CardTitle>Property Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="bedrooms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bedrooms *</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bathrooms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bathrooms *</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.5" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="square_feet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Square Feet</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="property_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="duplex">Duplex</SelectItem>
                      <SelectItem value="townhouse">Townhouse</SelectItem>
                      <SelectItem value="condo">Condo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="rent_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Rent *</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" placeholder="1200" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deposit_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Security Deposit</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="application_fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Application Fee</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="coming_soon">Coming Soon</SelectItem>
                      <SelectItem value="in_leasing_process">In Leasing Process</SelectItem>
                      <SelectItem value="rented">Rented</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchStatus === 'coming_soon' && (
              <FormField
                control={form.control}
                name="coming_soon_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Available Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>When will this property be available?</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Section 8 */}
        <Card>
          <CardHeader>
            <CardTitle>Section 8</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="section_8_accepted"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Section 8 Accepted</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hud_inspection_ready"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">HUD Inspection Ready</FormLabel>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              photos={photos}
              onChange={setPhotos}
              propertyId={property?.id}
            />
          </CardContent>
        </Card>

        {/* Media URLs */}
        <Card>
          <CardHeader>
            <CardTitle>Virtual Tours</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="video_tour_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Video Tour URL</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://youtube.com/..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="virtual_tour_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Virtual Tour URL</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://matterport.com/..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Public Description</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={generateAiDescription}
                      disabled={generatingDesc}
                      className="h-7 px-2 text-xs text-[#370d4b] hover:bg-[#370d4b]/10"
                    >
                      {generatingDesc ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI Magic</>
                      )}
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Describe the property for prospective tenants..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="special_notes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Internal Notes</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={generateAiNotes}
                      disabled={generatingNotes}
                      className="h-7 px-2 text-xs text-[#370d4b] hover:bg-[#370d4b]/10"
                    >
                      {generatingNotes ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI Magic</>
                      )}
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Notes for the team (not visible to prospects)..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Only visible to your team</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Amenities */}
        <Card>
          <CardHeader>
            <CardTitle>Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {amenitiesList.map((amenity) => (
                <div key={amenity.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={amenity.id}
                    checked={amenities.includes(amenity.id)}
                    onCheckedChange={() => toggleAmenity(amenity.id)}
                  />
                  <label
                    htmlFor={amenity.id}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {amenity.label}
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pet Policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pet Policy</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generateAiPetPolicy}
                disabled={generatingPetPolicy}
                className="h-7 px-2 text-xs text-[#370d4b] hover:bg-[#370d4b]/10"
              >
                {generatingPetPolicy ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI Magic</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="pet_policy"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="e.g., Cats allowed, dogs under 25lbs with deposit..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Alternative Properties */}
        <Card>
          <CardHeader>
            <CardTitle>Alternative Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <AlternativePropertiesSelector
              selectedIds={alternativePropertyIds}
              onChange={setAlternativePropertyIds}
              availableProperties={availableProperties}
              excludePropertyId={property?.id}
            />
            <p className="text-sm text-muted-foreground mt-2">
              Suggest these properties if this one doesn't match the lead's needs
            </p>
          </CardContent>
        </Card>

        {/* Assign Investor */}
        {investors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Assign Investor</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="investor_id"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an investor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No investor assigned</SelectItem>
                        {investors.map((investor) => (
                          <SelectItem key={investor.id} value={investor.id}>
                            {investor.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Assigned investor can view this property's metrics
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {property?.id ? 'Update Property' : 'Create Property'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
