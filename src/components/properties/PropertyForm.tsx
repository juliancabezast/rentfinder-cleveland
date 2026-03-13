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
  status: z.string(),
  coming_soon_date: z.string().optional(),
  video_tour_url: z.string().url().optional().or(z.literal('')),
  virtual_tour_url: z.string().url().optional().or(z.literal('')),
  description: z.string().optional(),
  special_notes: z.string().optional(),
  investor_id: z.string().optional(),
});

type PropertyFormData = z.infer<typeof propertySchema>;

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
  status: string;
  coming_soon_date?: string | null;
  photos?: string[] | null;
  video_tour_url?: string | null;
  virtual_tour_url?: string | null;
  description?: string | null;
  special_notes?: string | null;
  alternative_property_ids?: string[] | null;
  investor_id?: string | null;
  property_group_id?: string | null;
}

interface PropertyFormProps {
  property?: Property | null;
  propertyGroupId?: string;
  propertyGroupAddress?: string;
  propertyGroupCity?: string;
  propertyGroupState?: string;
  propertyGroupZip?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PropertyForm: React.FC<PropertyFormProps> = ({
  property,
  propertyGroupId,
  propertyGroupAddress,
  propertyGroupCity,
  propertyGroupState,
  propertyGroupZip,
  onSuccess,
  onCancel,
}) => {
  const isUnit = !!propertyGroupId || !!property?.property_group_id;
  const isAddingUnit = !!propertyGroupId && !property?.id;
  const { organization } = useAuth();
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(property?.photos) ? property.photos : []
  );
  const [alternativePropertyIds, setAlternativePropertyIds] = useState<string[]>(
    Array.isArray(property?.alternative_property_ids) ? property.alternative_property_ids : []
  );
  const [availableProperties, setAvailableProperties] = useState<Property[]>([]);
  const [investors, setInvestors] = useState<{ id: string; full_name: string }[]>([]);

  // AI generation states
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);

  // Zillow re-sync states (edit mode only)
  const [zillowUrl, setZillowUrl] = useState('');
  const [zillowLoading, setZillowLoading] = useState(false);
  const [zillowChanges, setZillowChanges] = useState<Record<string, { current: string; incoming: string }> | null>(null);
  const [zillowApprovals, setZillowApprovals] = useState<Record<string, boolean>>({});

  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      address: property?.address || propertyGroupAddress || '',
      unit_number: property?.unit_number || '',
      city: property?.city || propertyGroupCity || 'Cleveland',
      state: property?.state || propertyGroupState || 'OH',
      zip_code: property?.zip_code || propertyGroupZip || '',
      bedrooms: property?.bedrooms || 0,
      bathrooms: property?.bathrooms || 1,
      square_feet: property?.square_feet || undefined,
      property_type: property?.property_type || '',
      rent_price: property?.rent_price || 0,
      status: property?.status || 'available',
      coming_soon_date: property?.coming_soon_date || '',
      video_tour_url: property?.video_tour_url || '',
      virtual_tour_url: property?.virtual_tour_url || '',
      description: property?.description || '',
      special_notes: property?.special_notes || '',
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

  const fieldLabels: Record<string, string> = {
    bedrooms: 'Bedrooms',
    bathrooms: 'Bathrooms',
    square_feet: 'Sq Ft',
    rent_price: 'Monthly Rent',
    property_type: 'Property Type',
    description: 'Description',
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
        { key: 'description', formKey: 'description' },
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
        const numericFields = ['bedrooms', 'bathrooms', 'square_feet', 'rent_price'];
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
        status: data.status,
        coming_soon_date: data.status === 'coming_soon' ? data.coming_soon_date : null,
        video_tour_url: data.video_tour_url || null,
        virtual_tour_url: data.virtual_tour_url || null,
        description: data.description || null,
        special_notes: data.special_notes || null,
        investor_id: data.investor_id || null,
        organization_id: organization.id,
        photos: photos,
        alternative_property_ids: alternativePropertyIds,
        ...(propertyGroupId ? { property_group_id: propertyGroupId } : {}),
      };

      if (property?.id) {
        // Update
        const { error } = await supabase
          .from('properties')
          .update(propertyData)
          .eq('id', property.id);

        if (error) throw error;
        toast.success(isUnit ? 'Unit updated' : 'Property updated successfully');
      } else {
        // Create
        const { error } = await supabase
          .from('properties')
          .insert(propertyData);

        if (error) throw error;
        toast.success(propertyGroupId ? 'Unit added successfully' : 'Property created successfully');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error(error instanceof Error ? error.message : isAddingUnit ? 'Failed to save unit' : 'Failed to save property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Zillow Re-sync (edit mode only) */}
        {property?.id && (
          <Card className="border-[#4F46E5]/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#4F46E5]" />
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
                <div className="rounded-lg border border-[#4F46E5]/30 bg-[#4F46E5]/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#4F46E5] flex items-center gap-2">
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
                      const isMonetary = ['rent_price'].includes(key);
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
                            <span className="text-[#4F46E5] font-medium truncate">{truncIncoming}</span>
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
                      className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
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
            <CardTitle>{isAddingUnit ? 'Unit Information' : 'Basic Information'}</CardTitle>
            {isAddingUnit && (
              <p className="text-sm text-muted-foreground">Adding unit to {propertyGroupAddress}</p>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isAddingUnit && (
              <FormField
                control={form.control}
                name="unit_number"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Unit Name / Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="A, B, 1, 2..." {...field} autoFocus />
                    </FormControl>
                    <FormDescription>e.g. "A", "B", "1st Floor", "Upper"</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Street Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St" {...field} readOnly={isAddingUnit} className={isAddingUnit ? 'bg-muted' : ''} />
                  </FormControl>
                  {isAddingUnit && <FormDescription>Inherited from building</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isAddingUnit && (
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
            )}

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly={isAddingUnit} className={isAddingUnit ? 'bg-muted' : ''} />
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
                    <Input maxLength={2} {...field} readOnly={isAddingUnit} className={isAddingUnit ? 'bg-muted' : ''} />
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
                    <Input placeholder="44101" {...field} readOnly={isAddingUnit} className={isAddingUnit ? 'bg-muted' : ''} />
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
            <CardTitle>{isAddingUnit ? 'Unit Details' : 'Property Details'}</CardTitle>
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
                      <SelectItem value="triplex">Triplex</SelectItem>
                      <SelectItem value="fourplex">Fourplex</SelectItem>
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
                  <FormLabel>{isAddingUnit ? 'Unit Status *' : 'Property Status *'}</FormLabel>
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
                      className="h-7 px-2 text-xs text-[#4F46E5] hover:bg-[#4F46E5]/10"
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
                      className="h-7 px-2 text-xs text-[#4F46E5] hover:bg-[#4F46E5]/10"
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
            {property?.id ? (isUnit ? 'Update Unit' : 'Update Property') : propertyGroupId ? 'Add Unit' : 'Create Property'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
