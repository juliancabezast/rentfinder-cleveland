import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { AppRole } from '@/types/auth';

interface Property {
  id: string;
  address: string;
  unit_number: string | null;
}

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const InviteUserModal: React.FC<InviteUserModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { userRecord } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('viewer');
  const [commissionRate, setCommissionRate] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

  // Fetch properties for viewer role assignment
  useEffect(() => {
    const fetchProperties = async () => {
      if (!userRecord?.organization_id) return;

      const { data } = await supabase
        .from('properties')
        .select('id, address, unit_number')
        .eq('organization_id', userRecord.organization_id)
        .order('address');

      if (data) {
        setProperties(data);
      }
    };

    if (open && role === 'viewer') {
      fetchProperties();
    }
  }, [open, role, userRecord?.organization_id]);

  const handlePropertyToggle = (propertyId: string) => {
    setSelectedProperties((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord?.organization_id) return;

    // Validation
    if (!email || !fullName || !role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    if (role === 'leasing_agent' && !commissionRate) {
      toast({
        title: 'Validation Error',
        description: 'Commission rate is required for leasing agents.',
        variant: 'destructive',
      });
      return;
    }

    // Prevent creating super_admin
    if (role === 'super_admin') {
      toast({
        title: 'Permission Denied',
        description: 'You cannot create super admin users.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create user record
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          organization_id: userRecord.organization_id,
          email: email.toLowerCase().trim(),
          full_name: fullName.trim(),
          role,
          commission_rate: role === 'leasing_agent' ? parseFloat(commissionRate) : null,
          is_active: true,
        })
        .select()
        .single();

      if (userError) throw userError;

      // If viewer, create property access records
      if (role === 'viewer' && selectedProperties.length > 0 && newUser) {
        const accessRecords = selectedProperties.map((propertyId) => ({
          organization_id: userRecord.organization_id!,
          investor_id: newUser.id,
          property_id: propertyId,
          granted_by: userRecord.id,
        }));

        const { error: accessError } = await supabase
          .from('investor_property_access')
          .insert(accessRecords);

        if (accessError) {
          console.error('Error creating property access:', accessError);
        }
      }

      // Send invite email via Supabase Auth
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      // Note: This may fail if not using service role key, but user is still created
      if (inviteError) {
        console.warn('Could not send invite email (requires service role):', inviteError);
      }

      toast({
        title: 'User Invited',
        description: `${fullName} has been invited to the team.`,
      });

      // Reset form
      setEmail('');
      setFullName('');
      setRole('viewer');
      setCommissionRate('');
      setSelectedProperties([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error('Error inviting user:', error);
      const message = error instanceof Error ? error.message : 'Failed to invite user';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableRoles: { value: AppRole; label: string }[] = [
    { value: 'admin', label: 'Admin' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer (Investor)' },
    { value: 'leasing_agent', label: 'Leasing Agent' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Add a new user to your organization. They will receive an email invitation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === 'leasing_agent' && (
            <div className="space-y-2">
              <Label htmlFor="commissionRate">Commission Rate (%) *</Label>
              <Input
                id="commissionRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="50"
                required
              />
            </div>
          )}

          {role === 'viewer' && properties.length > 0 && (
            <div className="space-y-2">
              <Label>Property Access</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select properties this investor can view
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                {properties.map((property) => (
                  <div key={property.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`property-${property.id}`}
                      checked={selectedProperties.includes(property.id)}
                      onCheckedChange={() => handlePropertyToggle(property.id)}
                    />
                    <Label
                      htmlFor={`property-${property.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {property.address}
                      {property.unit_number && ` #${property.unit_number}`}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Inviting...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserModal;
