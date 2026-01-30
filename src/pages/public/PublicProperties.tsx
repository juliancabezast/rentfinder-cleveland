import React, { useState, useEffect } from "react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PublicPropertyCard } from "@/components/public/PublicPropertyCard";
import {
  LeadCapturePopup,
  useLeadCapturePopup,
} from "@/components/public/LeadCapturePopup";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, Search, Home, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties">;

const PublicProperties: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState("Rent Finder Cleveland");

  // Filters
  const [bedroomFilter, setBedroomFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [zipCode, setZipCode] = useState("");

  // Lead capture
  const { showPopup, setShowPopup, triggerPopup } = useLeadCapturePopup(15);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Fetch organization info
  useEffect(() => {
    const fetchOrganization = async () => {
      // In production, determine org from subdomain or URL
      // For now, get the first active organization
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, name, logo_url")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (orgData) {
        setOrganizationId(orgData.id);
        setOrganizationName(orgData.name);
      }
    };

    fetchOrganization();
  }, []);

  // Fetch properties
  useEffect(() => {
    const fetchProperties = async () => {
      if (!organizationId) return;

      setLoading(true);
      try {
        let query = supabase
          .from("properties")
          .select("*")
          .eq("organization_id", organizationId)
          .in("status", ["available", "coming_soon"])
          .order("created_at", { ascending: false });

        const { data, error } = await query;

        if (error) throw error;
        setProperties(data || []);
      } catch (error) {
        console.error("Error fetching properties:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();

    // Set up real-time subscription
    if (organizationId) {
      const channel = supabase
        .channel("public-properties")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "properties",
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            fetchProperties();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [organizationId]);

  // Filter properties
  const filteredProperties = properties.filter((p) => {
    if (bedroomFilter !== "all" && p.bedrooms !== parseInt(bedroomFilter)) {
      return false;
    }
    if (minPrice && p.rent_price < parseInt(minPrice)) {
      return false;
    }
    if (maxPrice && p.rent_price > parseInt(maxPrice)) {
      return false;
    }
    if (zipCode && !p.zip_code.includes(zipCode)) {
      return false;
    }
    return true;
  });

  const handleScheduleShowing = (property: Property) => {
    setSelectedProperty(property);
    triggerPopup();
  };

  return (
    <PublicLayout organizationName={organizationName}>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <Badge className="mb-4 bg-accent text-accent-foreground">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Section 8 Friendly
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Find Your Next Home
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            Browse our available rental properties in Cleveland. All properties
            welcome Section 8 voucher holders.
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-6 mt-8">
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
              <Building2 className="h-5 w-5" />
              <span>{properties.length} Properties</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
              <Home className="h-5 w-5" />
              <span>Section 8 Welcome</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="sticky top-16 z-40 bg-card border-b shadow-sm py-4">
        <div className="container mx-auto px-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search by Zip */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by zip code..."
                className="pl-10"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
            </div>

            {/* Bedrooms */}
            <Select value={bedroomFilter} onValueChange={setBedroomFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Bedrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Bedrooms</SelectItem>
                <SelectItem value="1">1 Bedroom</SelectItem>
                <SelectItem value="2">2 Bedrooms</SelectItem>
                <SelectItem value="3">3 Bedrooms</SelectItem>
                <SelectItem value="4">4+ Bedrooms</SelectItem>
              </SelectContent>
            </Select>

            {/* Min Price */}
            <Input
              type="number"
              placeholder="Min Price"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />

            {/* Max Price */}
            <Input
              type="number"
              placeholder="Max Price"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Properties Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-video w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-16">
              <Home className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">No properties found</h2>
              <p className="text-muted-foreground">
                Try adjusting your filters or check back soon for new listings.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Showing {filteredProperties.length} properties
              </p>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProperties.map((property) => (
                  <PublicPropertyCard
                    key={property.id}
                    property={{
                      id: property.id,
                      address: property.address,
                      city: property.city,
                      state: property.state,
                      zip_code: property.zip_code,
                      bedrooms: property.bedrooms,
                      bathrooms: property.bathrooms,
                      rent_price: property.rent_price,
                      status: property.status,
                      section_8_accepted: property.section_8_accepted,
                      photos: Array.isArray(property.photos) ? property.photos as string[] : null,
                      coming_soon_date: property.coming_soon_date,
                    }}
                    onScheduleShowing={() => handleScheduleShowing(property)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Lead Capture Popup */}
      {organizationId && (
        <LeadCapturePopup
          open={showPopup}
          onOpenChange={setShowPopup}
          propertyId={selectedProperty?.id}
          propertyAddress={selectedProperty?.address}
          organizationId={organizationId}
          source="website"
        />
      )}
    </PublicLayout>
  );
};

export default PublicProperties;
