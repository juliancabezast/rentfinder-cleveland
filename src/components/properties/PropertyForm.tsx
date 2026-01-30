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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
    } catch (error: any) {
      console.error('Error saving property:', error);
      toast.error(error.message || 'Failed to save property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <FormLabel>Public Description</FormLabel>
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
                  <FormLabel>Internal Notes</FormLabel>
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
            <CardTitle>Pet Policy</CardTitle>
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
