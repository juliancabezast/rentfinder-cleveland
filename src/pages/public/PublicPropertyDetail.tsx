import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { PublicLayout } from "@/components/public/PublicLayout";
import { LeadCapturePopup } from "@/components/public/LeadCapturePopup";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Bed,
  Bath,
  Square,
  Home,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Calendar,
  Shield,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

const PublicPropertyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [organizationName, setOrganizationName] = useState("Rent Finder Cleveland");

  useEffect(() => {
    const fetchProperty = async () => {
      if (!id) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("properties")
          .select("*")
          .eq("id", id)
          .in("status", ["available", "coming_soon"])
          .single();

        if (error) throw error;
        setProperty(data);

        // Fetch org name
        if (data?.organization_id) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", data.organization_id)
            .single();
          if (orgData) {
            setOrganizationName(orgData.name);
          }
        }
      } catch (error) {
        console.error("Error fetching property:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [id]);

  // Dynamic SEO meta tags
  useEffect(() => {
    if (property) {
      const propertyType = property.property_type || 'Apartment';
      const title = `${property.bedrooms}BR ${propertyType} for Rent — ${property.address}, ${property.city} OH ${property.zip_code} | Rent Finder Cleveland`;
      document.title = title;

      // Update meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content',
          `${property.bedrooms} bedroom ${propertyType.toLowerCase()} for rent at ${property.address}, ${property.city}, Ohio ${property.zip_code}. $${property.rent_price}/month. ${property.section_8_accepted ? 'Section 8 accepted.' : ''} Schedule a showing on Rent Finder Cleveland.`
        );
      }

      // Update OG tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', title);

      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content',
        `$${property.rent_price}/mo · ${property.bedrooms}BR/${property.bathrooms}BA · ${property.address}, ${property.city} OH · ${property.section_8_accepted ? 'Section 8 Welcome' : ''}`
      );

      // Set og:url
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', `https://rentfindercleveland.com/p/properties/${property.id}`);

      // Set first photo as og:image if available
      const photos = property.photos as string[];
      if (photos && photos.length > 0) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) ogImage.setAttribute('content', photos[0]);
      }
    }

    // Cleanup: restore defaults on unmount
    return () => {
      document.title = 'Rent Finder Cleveland | Find Apartments & Rental Homes in Cleveland, Ohio';
    };
  }, [property]);

  if (loading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="aspect-video w-full mb-6" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!property) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 text-center">
          <Home className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold mb-2">Property Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This property may no longer be available.
          </p>
          <Button asChild>
            <Link to="/p/properties">Browse Available Properties</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const photos = Array.isArray(property.photos) ? (property.photos as string[]) : [];
  const amenities = property.amenities as Record<string, boolean> | null;
  const isComingSoon = property.status === "coming_soon";
  const propertyType = property.property_type || 'apartment';

  const nextPhoto = () => {
    setCurrentPhotoIndex((i) => (i + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  // Generate JSON-LD for this property
  const propertyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Apartment",
    "name": `${property.bedrooms}BR ${propertyType} at ${property.address}`,
    "description": property.description || `${property.bedrooms} bedroom rental in ${property.city}, Ohio`,
    "url": `https://rentfindercleveland.com/p/properties/${property.id}`,
    "image": photos[0] || '',
    "numberOfRooms": property.bedrooms,
    "numberOfBathroomsTotal": property.bathrooms,
    ...(property.square_feet && {
      "floorSize": {
        "@type": "QuantitativeValue",
        "value": property.square_feet,
        "unitCode": "FTK"
      }
    }),
    "address": {
      "@type": "PostalAddress",
      "streetAddress": property.address,
      "addressLocality": property.city,
      "addressRegion": "OH",
      "postalCode": property.zip_code,
      "addressCountry": "US"
    },
    "offers": {
      "@type": "Offer",
      "price": property.rent_price,
      "priceCurrency": "USD",
      "availability": property.status === 'available' ? "https://schema.org/InStock" : "https://schema.org/PreOrder"
    },
    "amenityFeature": (amenities ? Object.keys(amenities).filter(k => amenities[k]) : []).map(a => ({
      "@type": "LocationFeatureSpecification",
      "name": a.replace(/_/g, ' ')
    }))
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Rent Finder Cleveland", "item": "https://rentfindercleveland.com" },
      { "@type": "ListItem", "position": 2, "name": "Cleveland Apartments for Rent", "item": "https://rentfindercleveland.com/p/properties" },
      { "@type": "ListItem", "position": 3, "name": property.address }
    ]
  };

  return (
    <PublicLayout organizationName={organizationName}>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(propertyJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumbs */}
        <nav className="mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-primary transition-colors">
                Rent Finder Cleveland
              </Link>
            </li>
            <li>/</li>
            <li>
              <Link to="/p/properties" className="hover:text-primary transition-colors">
                Cleveland Apartments
              </Link>
            </li>
            <li>/</li>
            <li className="text-foreground font-medium truncate max-w-[200px]">
              {property.address}
            </li>
          </ol>
        </nav>

        {/* Photo Gallery */}
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden mb-8">
          {photos.length > 0 ? (
            <>
              <img
                src={photos[currentPhotoIndex]}
                alt={`${property.bedrooms} bedroom ${propertyType} for rent at ${property.address}, ${property.city} Ohio - Photo ${currentPhotoIndex + 1} of ${photos.length}`}
                className="w-full h-full object-cover"
                loading={currentPhotoIndex === 0 ? "eager" : "lazy"}
              />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={prevPhoto}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPhotoIndex(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          i === currentPhotoIndex ? "bg-white" : "bg-white/50"
                        }`}
                        aria-label={`View photo ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
              <Home className="h-24 w-24 text-primary/30" aria-hidden="true" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            {isComingSoon ? (
              <Badge className="bg-warning text-warning-foreground text-sm">
                <Calendar className="mr-1 h-4 w-4" aria-hidden="true" />
                Coming Soon
              </Badge>
            ) : (
              <Badge className="bg-success text-success-foreground text-sm">
                <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Available Now
              </Badge>
            )}
            {property.section_8_accepted && (
              <Badge className="bg-primary text-primary-foreground text-sm">
                Section 8 Welcome
              </Badge>
            )}
            {property.hud_inspection_ready && (
              <Badge className="bg-accent text-accent-foreground text-sm">
                <Shield className="mr-1 h-4 w-4" aria-hidden="true" />
                HUD Inspection Ready
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <article className="lg:col-span-2 space-y-8">
            {/* Price & Details */}
            <header>
              <p className="text-4xl font-bold text-primary mb-2">
                ${property.rent_price.toLocaleString()}
                <span className="text-lg font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <h1 className="text-lg font-medium">
                {property.bedrooms} Bedroom {propertyType} for Rent — {property.address}
              </h1>
              <p className="text-muted-foreground">
                {property.city}, {property.state} {property.zip_code}
              </p>

              <div className="flex flex-wrap gap-6 mt-4">
                <span className="flex items-center gap-2 text-lg">
                  <Bed className="h-5 w-5 text-primary" aria-hidden="true" />
                  {property.bedrooms} {property.bedrooms === 1 ? "Bedroom" : "Bedrooms"}
                </span>
                <span className="flex items-center gap-2 text-lg">
                  <Bath className="h-5 w-5 text-primary" aria-hidden="true" />
                  {property.bathrooms} {property.bathrooms === 1 ? "Bathroom" : "Bathrooms"}
                </span>
                {property.square_feet && (
                  <span className="flex items-center gap-2 text-lg">
                    <Square className="h-5 w-5 text-primary" aria-hidden="true" />
                    {property.square_feet.toLocaleString()} sq ft
                  </span>
                )}
              </div>
            </header>

            <Separator />

            {/* Description */}
            {property.description && (
              <section aria-labelledby="description-heading">
                <h2 id="description-heading" className="text-xl font-semibold mb-3">About This Property</h2>
                <p className="text-muted-foreground whitespace-pre-line">
                  {property.description}
                </p>
              </section>
            )}

            {/* Amenities */}
            {amenities && Object.keys(amenities).length > 0 && (
              <section aria-labelledby="amenities-heading">
                <h2 id="amenities-heading" className="text-xl font-semibold mb-3">Amenities</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(amenities)
                    .filter(([_, value]) => value)
                    .map(([key]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                        <span className="capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Pet Policy */}
            {property.pet_policy && (
              <section aria-labelledby="pet-policy-heading">
                <h2 id="pet-policy-heading" className="text-xl font-semibold mb-3">Pet Policy</h2>
                <p className="text-muted-foreground">{property.pet_policy}</p>
              </section>
            )}

            {/* Details */}
            <section aria-labelledby="details-heading">
              <h2 id="details-heading" className="text-xl font-semibold mb-3">Details</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {property.property_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Property Type</span>
                    <span className="capitalize">{property.property_type}</span>
                  </div>
                )}
                {property.deposit_amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Security Deposit</span>
                    <span>${property.deposit_amount.toLocaleString()}</span>
                  </div>
                )}
                {property.application_fee && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Application Fee</span>
                    <span>${property.application_fee}</span>
                  </div>
                )}
              </div>
            </section>
          </article>

          {/* Sidebar - Contact Card */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">Interested in this property?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  size="lg"
                  onClick={() => setShowLeadCapture(true)}
                >
                  <Phone className="mr-2 h-5 w-5" aria-hidden="true" />
                  Contact Us About This Property
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  <p>We'll reach out to schedule a showing.</p>
                </div>

                {property.section_8_accepted && (
                  <div className="rounded-lg bg-primary/5 p-4 text-sm">
                    <p className="font-medium text-primary flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Section 8 Welcome
                    </p>
                    <p className="text-muted-foreground mt-1">
                      This property accepts Housing Choice Vouchers. Let us
                      know your voucher amount when you contact us.
                    </p>
                  </div>
                )}

                {property.hud_inspection_ready && (
                  <div className="rounded-lg bg-accent/10 p-4 text-sm">
                    <p className="font-medium text-accent-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4 text-accent" aria-hidden="true" />
                      HUD Inspection Ready
                    </p>
                    <p className="text-muted-foreground mt-1">
                      This property is ready for HUD inspections, meaning
                      faster move-in for voucher holders.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Lead Capture Popup */}
      <LeadCapturePopup
        open={showLeadCapture}
        onOpenChange={setShowLeadCapture}
        propertyId={property.id}
        propertyAddress={property.address}
        organizationId={property.organization_id}
        source="website"
      />
    </PublicLayout>
  );
};

export default PublicPropertyDetail;