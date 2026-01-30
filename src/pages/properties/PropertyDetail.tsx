import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyForm } from '@/components/properties/PropertyForm';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Bed,
  Bath,
  Square,
  MapPin,
  DollarSign,
  Calendar,
  AlertTriangle,
  Check,
  Home,
  Users,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Video,
  View,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, differenceInDays, isPast } from 'date-fns';

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
  created_at?: string;
  listed_date?: string | null;
}

interface Lead {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
}

interface Showing {
  id: string;
  scheduled_at: string;
  status: string;
  lead: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-success text-success-foreground' },
  coming_soon: { label: 'Coming Soon', className: 'bg-warning text-warning-foreground' },
  in_leasing_process: { label: 'In Leasing', className: 'bg-primary text-primary-foreground' },
  rented: { label: 'Rented', className: 'bg-muted text-muted-foreground' },
};

const amenityLabels: Record<string, string> = {
  washer_dryer: 'Washer/Dryer',
  dishwasher: 'Dishwasher',
  ac: 'A/C',
  heating: 'Heating',
  parking: 'Parking',
  garage: 'Garage',
  fenced_yard: 'Fenced Yard',
  pets_allowed: 'Pets Allowed',
  pool: 'Pool',
  gym: 'Gym',
  storage: 'Storage',
  hardwood_floors: 'Hardwood Floors',
};

const PropertyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const permissions = usePermissions();

  const [property, setProperty] = useState<Property | null>(null);
  const [alternativeProperties, setAlternativeProperties] = useState<Property[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [upcomingShowings, setUpcomingShowings] = useState<Showing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    const fetchProperty = async () => {
      if (!id || !organization?.id) return;

      setLoading(true);
      try {
        // Fetch property
        const { data: propertyData, error: propertyError } = await supabase
          .from('properties')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organization.id)
          .single();

        if (propertyError) throw propertyError;

        const parsedProperty: Property = {
          id: propertyData.id,
          address: propertyData.address,
          unit_number: propertyData.unit_number,
          city: propertyData.city,
          state: propertyData.state,
          zip_code: propertyData.zip_code,
          bedrooms: propertyData.bedrooms,
          bathrooms: propertyData.bathrooms,
          square_feet: propertyData.square_feet,
          property_type: propertyData.property_type,
          rent_price: propertyData.rent_price,
          deposit_amount: propertyData.deposit_amount,
          application_fee: propertyData.application_fee,
          status: propertyData.status,
          coming_soon_date: propertyData.coming_soon_date,
          section_8_accepted: propertyData.section_8_accepted,
          hud_inspection_ready: propertyData.hud_inspection_ready,
          video_tour_url: propertyData.video_tour_url,
          virtual_tour_url: propertyData.virtual_tour_url,
          description: propertyData.description,
          special_notes: propertyData.special_notes,
          pet_policy: propertyData.pet_policy,
          investor_id: propertyData.investor_id,
          created_at: propertyData.created_at,
          listed_date: propertyData.listed_date,
          photos: Array.isArray(propertyData.photos) 
            ? propertyData.photos.map((p: any) => String(p)) 
            : [],
          amenities: Array.isArray(propertyData.amenities) 
            ? propertyData.amenities.map((a: any) => String(a)) 
            : [],
          alternative_property_ids: Array.isArray(propertyData.alternative_property_ids) 
            ? propertyData.alternative_property_ids.map((id: any) => String(id)) 
            : [],
        };

        setProperty(parsedProperty);

        // Fetch alternative properties
        if (parsedProperty.alternative_property_ids && parsedProperty.alternative_property_ids.length > 0) {
          const { data: altData } = await supabase
            .from('properties')
            .select('id, address, unit_number, city, bedrooms, rent_price, status, photos')
            .in('id', parsedProperty.alternative_property_ids);

          if (altData) {
            setAlternativeProperties(
              altData.map((p) => ({
                ...p,
                photos: Array.isArray(p.photos) 
                  ? (p.photos as any[]).map((photo: any) => String(photo)) 
                  : [],
              })) as Property[]
            );
          }
        }

        // Fetch recent leads interested in this property
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, full_name, first_name, last_name, status, created_at')
          .eq('interested_property_id', id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (leadsData) {
          setRecentLeads(leadsData);
        }

        // Fetch upcoming showings
        const { data: showingsData } = await supabase
          .from('showings')
          .select('id, scheduled_at, status, lead:leads(full_name, first_name, last_name)')
          .eq('property_id', id)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(5);

        if (showingsData) {
          setUpcomingShowings(showingsData as Showing[]);
        }
      } catch (error) {
        console.error('Error fetching property:', error);
        toast.error('Failed to load property');
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [id, organization?.id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!property) return;

    try {
      const { error } = await supabase
        .from('properties')
        .update({ status: newStatus })
        .eq('id', property.id);

      if (error) throw error;

      setProperty({ ...property, status: newStatus });
      toast.success('Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!property) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', property.id);

      if (error) throw error;

      toast.success('Property deleted');
      navigate('/properties');
    } catch (error) {
      console.error('Error deleting property:', error);
      toast.error('Failed to delete property');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    // Refetch property data
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 lg:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <Home className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">Property not found</h3>
        <Button className="mt-4" onClick={() => navigate('/properties')}>
          Back to Properties
        </Button>
      </div>
    );
  }

  const photos = property.photos || [];
  const amenities = property.amenities || [];
  const statusInfo = statusConfig[property.status] || statusConfig.available;
  const fullAddress = property.unit_number
    ? `${property.address}, Unit ${property.unit_number}`
    : property.address;

  // Coming soon date warning
  let comingSoonWarning = null;
  if (property.status === 'coming_soon' && property.coming_soon_date) {
    const daysUntil = differenceInDays(new Date(property.coming_soon_date), new Date());
    const isExpired = isPast(new Date(property.coming_soon_date));

    if (isExpired) {
      comingSoonWarning = {
        type: 'error',
        message: 'This property was expected to be available. Update the status.',
      };
    } else if (daysUntil <= 7) {
      comingSoonWarning = {
        type: 'warning',
        message: `Available in ${daysUntil} day(s). Consider updating status soon.`,
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/properties')}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Properties
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{fullAddress}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {property.city}, {property.state} {property.zip_code}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {permissions.canEditProperty && (
            <Button variant="outline" onClick={() => setFormOpen(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {permissions.canDeleteProperty && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Property</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this property? This action cannot be undone.
                    All associated leads and showings will be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Coming Soon Warning */}
      {comingSoonWarning && (
        <div
          className={cn(
            'flex items-center gap-2 p-3 rounded-lg',
            comingSoonWarning.type === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-warning/10 text-warning-foreground'
          )}
        >
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm font-medium">{comingSoonWarning.message}</span>
        </div>
      )}

      {/* Photo Gallery */}
      <Card>
        <CardContent className="p-0">
          {photos.length > 0 ? (
            <div className="relative">
              <div className="aspect-video bg-muted overflow-hidden rounded-t-lg">
                <img
                  src={photos[currentPhotoIndex]}
                  alt={`Property photo ${currentPhotoIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {photos.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={() =>
                      setCurrentPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() =>
                      setCurrentPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        className={cn(
                          'w-2 h-2 rounded-full transition-colors',
                          i === currentPhotoIndex ? 'bg-white' : 'bg-white/50'
                        )}
                        onClick={() => setCurrentPhotoIndex(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="aspect-video bg-muted flex items-center justify-center rounded-t-lg">
              <Home className="h-16 w-16 text-muted-foreground/50" />
            </div>
          )}
          
          {/* Thumbnails */}
          {photos.length > 1 && (
            <div className="flex gap-2 p-2 overflow-x-auto">
              {photos.map((photo, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPhotoIndex(i)}
                  className={cn(
                    'w-16 h-16 rounded overflow-hidden shrink-0 border-2 transition-colors',
                    i === currentPhotoIndex ? 'border-primary' : 'border-transparent'
                  )}
                >
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Details */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <Badge className={cn('text-sm', statusInfo.className)}>
                  {statusInfo.label}
                </Badge>
                {property.section_8_accepted && (
                  <Badge variant="secondary">
                    <Check className="h-3 w-3 mr-1" />
                    Section 8
                  </Badge>
                )}
                {property.hud_inspection_ready && (
                  <Badge variant="outline">HUD Ready</Badge>
                )}
              </div>

              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold text-foreground">
                  ${property.rent_price.toLocaleString()}
                </span>
                <span className="text-muted-foreground">/month</span>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Bed className="h-5 w-5 text-muted-foreground" />
                  <span>{property.bedrooms} Bedrooms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Bath className="h-5 w-5 text-muted-foreground" />
                  <span>{property.bathrooms} Bathrooms</span>
                </div>
                {property.square_feet && (
                  <div className="flex items-center gap-2">
                    <Square className="h-5 w-5 text-muted-foreground" />
                    <span>{property.square_feet.toLocaleString()} sqft</span>
                  </div>
                )}
                {property.property_type && (
                  <div className="flex items-center gap-2">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <span className="capitalize">{property.property_type}</span>
                  </div>
                )}
              </div>

              {/* Pricing details */}
              <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {property.deposit_amount && (
                  <div>
                    <span className="text-muted-foreground">Deposit</span>
                    <p className="font-medium">${property.deposit_amount.toLocaleString()}</p>
                  </div>
                )}
                {property.application_fee && (
                  <div>
                    <span className="text-muted-foreground">Application Fee</span>
                    <p className="font-medium">${property.application_fee}</p>
                  </div>
                )}
                {property.coming_soon_date && property.status === 'coming_soon' && (
                  <div>
                    <span className="text-muted-foreground">Available Date</span>
                    <p className="font-medium">
                      {format(new Date(property.coming_soon_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          {property.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {property.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Special Notes (Internal) */}
          {property.special_notes && permissions.canEditProperty && (
            <Card className="border-warning/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Internal Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {property.special_notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Amenities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((amenity) => (
                    <Badge key={amenity} variant="secondary">
                      {amenityLabels[amenity] || amenity}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pet Policy */}
          {property.pet_policy && (
            <Card>
              <CardHeader>
                <CardTitle>Pet Policy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{property.pet_policy}</p>
              </CardContent>
            </Card>
          )}

          {/* Virtual Tours */}
          {(property.video_tour_url || property.virtual_tour_url) && (
            <Card>
              <CardHeader>
                <CardTitle>Virtual Tours</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {property.video_tour_url && (
                  <Button variant="outline" asChild>
                    <a href={property.video_tour_url} target="_blank" rel="noopener noreferrer">
                      <Video className="h-4 w-4 mr-2" />
                      Video Tour
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </a>
                  </Button>
                )}
                {property.virtual_tour_url && (
                  <Button variant="outline" asChild>
                    <a href={property.virtual_tour_url} target="_blank" rel="noopener noreferrer">
                      <View className="h-4 w-4 mr-2" />
                      3D Tour
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Alternative Properties */}
          {alternativeProperties.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Alternative Properties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {alternativeProperties.map((alt) => (
                    <Link
                      key={alt.id}
                      to={`/properties/${alt.id}`}
                      className="flex gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="w-16 h-16 bg-muted rounded overflow-hidden shrink-0">
                        {alt.photos?.[0] ? (
                          <img
                            src={alt.photos[0]}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Home className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{alt.address}</p>
                        <p className="text-xs text-muted-foreground">
                          {alt.bedrooms}bd · ${alt.rent_price.toLocaleString()}/mo
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] mt-1',
                            alt.status === 'available' && 'bg-success/20'
                          )}
                        >
                          {statusConfig[alt.status]?.label || alt.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Change */}
          {permissions.canChangePropertyStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={property.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="coming_soon">Coming Soon</SelectItem>
                    <SelectItem value="in_leasing_process">In Leasing Process</SelectItem>
                    <SelectItem value="rented">Rented</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Recent Leads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Recent Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads for this property yet</p>
              ) : (
                <div className="space-y-3">
                  {recentLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(lead.created_at), 'MMM d')}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {lead.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Showings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Upcoming Showings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingShowings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming showings</p>
              ) : (
                <div className="space-y-3">
                  {upcomingShowings.map((showing) => (
                    <div key={showing.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(showing.scheduled_at), 'MMM d, h:mm a')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {showing.lead?.full_name ||
                            `${showing.lead?.first_name || ''} ${showing.lead?.last_name || ''}`.trim() ||
                            'Unknown'}
                        </p>
                      </div>
                      <Badge
                        variant={showing.status === 'confirmed' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {showing.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
          </DialogHeader>
          <PropertyForm
            property={property}
            onSuccess={handleFormSuccess}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertyDetail;
