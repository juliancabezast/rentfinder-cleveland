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
import { toast } from 'sonner';
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
      toast.error('Please fill in all required fields');
      return;
    }

    if (role === 'leasing_agent' && !commissionRate) {
      toast.error('Commission rate is required for leasing agents');
      return;
    }

    // Prevent creating super_admin
    if (role === 'super_admin') {
      toast.error('You cannot create super admin users');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the edge function to invite user securely
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: email.toLowerCase().trim(),
          role,
          full_name: fullName.trim(),
          commission_rate: role === 'leasing_agent' ? parseFloat(commissionRate) : undefined,
          property_ids: role === 'viewer' ? selectedProperties : undefined,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to invite user');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Show appropriate toast based on response
      if (data?.warning) {
        toast.info(`Usuario creado — ${data.warning}`);
      } else {
        toast.success(`Invitación enviada — ${fullName} ha sido invitado al equipo`);
      }

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
      toast.error(message);
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
