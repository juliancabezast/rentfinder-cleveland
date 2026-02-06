import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Upload, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
];

export const OrganizationTab: React.FC = () => {
  const { organization, userRecord } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [primaryColor, setPrimaryColor] = useState('#370d4b');
  const [accentColor, setAccentColor] = useState('#ffb22c');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      setName(organization.name || '');
      setTimezone(organization.timezone || 'America/New_York');
      setPrimaryColor(organization.primary_color || '#370d4b');
      setAccentColor(organization.accent_color || '#ffb22c');
      setLogoUrl(organization.logo_url);
    }
    // Fetch full org details
    const fetchOrg = async () => {
      if (!userRecord?.organization_id) return;
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userRecord.organization_id)
        .single();
      if (data) {
        setName(data.name || '');
        setPhone(data.phone || '');
        setOwnerEmail(data.owner_email || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setState(data.state || '');
        setZipCode(data.zip_code || '');
        setTimezone(data.timezone || 'America/New_York');
        setPrimaryColor(data.primary_color || '#370d4b');
        setAccentColor(data.accent_color || '#ffb22c');
        setLogoUrl(data.logo_url);
      }
    };
    fetchOrg();
  }, [organization, userRecord?.organization_id]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userRecord?.organization_id) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userRecord.organization_id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('property-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('property-photos')
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);
      toast.success('Logo uploaded — Save changes to apply');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Upload failed');
    }
  };

  const handleSave = async () => {
    if (!userRecord?.organization_id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name,
          phone,
          owner_email: ownerEmail,
          address,
          city,
          state,
          zip_code: zipCode,
          timezone,
          primary_color: primaryColor,
          accent_color: accentColor,
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userRecord.organization_id);

      if (error) throw error;

      toast.success('Organization settings have been updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>Basic organization information and branding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={logoUrl || undefined} />
              <AvatarFallback className="text-2xl">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="logo-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Upload className="h-4 w-4" />
                  Upload Logo
                </div>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Recommended: 200x200px, PNG or JPG
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rent Finder Cleveland"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Owner Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(216) 555-0100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cleveland"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="OH"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="44101"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize colors for your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#370d4b"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accentColor"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#ffb22c"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-lg border">
            <div
              className="w-12 h-12 rounded"
              style={{ backgroundColor: primaryColor }}
            />
            <div
              className="w-12 h-12 rounded"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-sm text-muted-foreground">Preview</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
