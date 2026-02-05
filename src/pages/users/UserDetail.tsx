import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/users/RoleBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { AppRole } from '@/types/auth';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  commission_rate: number | null;
  created_at: string | null;
}

interface Property {
  id: string;
  address: string;
  unit_number: string | null;
}

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRecord } = useAuth();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>('viewer');
  const [isActive, setIsActive] = useState(true);
  const [commissionRate, setCommissionRate] = useState('');

  // Property access for viewers
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  // Stats for leasing agents
  const [assignedLeadsCount, setAssignedLeadsCount] = useState(0);
  const [assignedShowingsCount, setAssignedShowingsCount] = useState(0);

  const isOwnProfile = userRecord?.id === id;
  const canEdit = !isOwnProfile || userRecord?.role !== role; // Can't change own role

  useEffect(() => {
    const fetchUser = async () => {
      if (!id) return;

      setLoading(true);
      try {
        // Fetch user
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', id)
          .single();

        if (userError) throw userError;

        setUser(userData);
        setFullName(userData.full_name);
        setPhone(userData.phone || '');
        setRole(userData.role);
        setIsActive(userData.is_active ?? true);
        setCommissionRate(userData.commission_rate?.toString() || '');

        // Fetch property access for viewers
        if (userData.role === 'viewer') {
          const { data: accessData } = await supabase
            .from('investor_property_access')
            .select('property_id')
            .eq('investor_id', id);

          if (accessData) {
            setSelectedProperties(accessData.map((a) => a.property_id));
          }
        }

        // Fetch stats for leasing agents
        if (userData.role === 'leasing_agent') {
          const [leadsResult, showingsResult] = await Promise.all([
            supabase
              .from('leads')
              .select('*', { count: 'exact', head: true })
              .eq('assigned_leasing_agent_id', id),
            supabase
              .from('showings')
              .select('*', { count: 'exact', head: true })
              .eq('leasing_agent_id', id)
              .in('status', ['scheduled', 'confirmed']),
          ]);

          setAssignedLeadsCount(leadsResult.count || 0);
          setAssignedShowingsCount(showingsResult.count || 0);
        }

        // Fetch all properties for property access management
        if (userRecord?.organization_id) {
          const { data: propsData } = await supabase
            .from('properties')
            .select('id, address, unit_number')
            .eq('organization_id', userRecord.organization_id)
            .order('address');

          if (propsData) {
            setProperties(propsData);
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        toast({
          title: 'Error',
          description: 'Failed to load user details.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id, userRecord?.organization_id]);

  const handlePropertyToggle = (propertyId: string) => {
    setSelectedProperties((prev) =>
      prev.includes(propertyId)
        ? prev.filter((pid) => pid !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSave = async () => {
    if (!user || !userRecord) return;

    // Validation
    if (isOwnProfile && role !== user.role) {
      toast({
        title: 'Permission Denied',
        description: 'You cannot change your own role.',
        variant: 'destructive',
      });
      return;
    }

    if (role === 'super_admin' && userRecord.role !== 'super_admin') {
      toast({
        title: 'Permission Denied',
        description: 'You cannot assign super admin role.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Update user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: isOwnProfile ? user.role : role, // Prevent changing own role
          is_active: isActive,
          commission_rate: role === 'leasing_agent' ? parseFloat(commissionRate) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Update property access for viewers
      if (role === 'viewer') {
        // Remove existing access
        await supabase
          .from('investor_property_access')
          .delete()
          .eq('investor_id', user.id);

        // Add new access
        if (selectedProperties.length > 0) {
          const accessRecords = selectedProperties.map((propertyId) => ({
            organization_id: userRecord.organization_id!,
            investor_id: user.id,
            property_id: propertyId,
            granted_by: userRecord.id,
          }));

          const { error: accessError } = await supabase
            .from('investor_property_access')
            .insert(accessRecords);

          if (accessError) {
            console.error('Error updating property access:', accessError);
          }
        }
      }

      toast({
        title: 'User Updated',
        description: 'User details have been saved.',
      });

      // Refresh user data
      setUser({
        ...user,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role: isOwnProfile ? user.role : role,
        is_active: isActive,
        commission_rate: role === 'leasing_agent' ? parseFloat(commissionRate) : null,
      });
    } catch (error) {
      console.error('Error saving user:', error);
      toast({
        title: 'Error',
        description: 'Failed to save user details.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;

    if (isOwnProfile) {
      toast({
        title: 'Permission Denied',
        description: 'You cannot delete your own account.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase.from('users').delete().eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'User Deleted',
        description: 'The user has been removed.',
      });

      navigate('/users');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user.',
        variant: 'destructive',
      });
    }
  };

  const availableRoles: { value: AppRole; label: string }[] = [
    { value: 'admin', label: 'Admin' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer (Investor)' },
    { value: 'leasing_agent', label: 'Leasing Agent' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found.</p>
        <Button variant="link" onClick={() => navigate('/users')}>
          Back to Team Members
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">User Details</h1>
          <p className="text-muted-foreground">
            Manage user information and permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isOwnProfile && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {user.full_name}? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Basic user details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-lg">
                  {user.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-lg">{user.full_name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <RoleBadge role={user.role} className="mt-1" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              {isOwnProfile ? (
                <>
                  <Input id="role" value={role} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    You cannot change your own role
                  </p>
                </>
              ) : (
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive">Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive users cannot log in
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isOwnProfile}
              />
            </div>
          </CardContent>
        </Card>

        {role === 'leasing_agent' && (
          <Card>
            <CardHeader>
              <CardTitle>Leasing Agent Details</CardTitle>
              <CardDescription>Commission and assignments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="commissionRate">Commission Rate (%)</Label>
                <Input
                  id="commissionRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold">{assignedLeadsCount}</p>
                  <p className="text-sm text-muted-foreground">Assigned Leads</p>
                </div>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold">{assignedShowingsCount}</p>
                  <p className="text-sm text-muted-foreground">Upcoming Showings</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {role === 'viewer' && (
          <Card>
            <CardHeader>
              <CardTitle>Property Access</CardTitle>
              <CardDescription>
                Select properties this investor can view
              </CardDescription>
            </CardHeader>
            <CardContent>
              {properties.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No properties available
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted"
                    >
                      <Checkbox
                        id={`prop-${property.id}`}
                        checked={selectedProperties.includes(property.id)}
                        onCheckedChange={() => handlePropertyToggle(property.id)}
                      />
                      <Label
                        htmlFor={`prop-${property.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {property.address}
                        {property.unit_number && ` #${property.unit_number}`}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UserDetail;
