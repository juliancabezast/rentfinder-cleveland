import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types/auth';

interface RoleBadgeProps {
  role: AppRole;
  className?: string;
}

const roleConfig: Record<AppRole, { label: string; className: string }> = {
  super_admin: {
    label: 'Super Admin',
    className: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  admin: {
    label: 'Admin',
    className: 'bg-purple-600 text-white hover:bg-purple-700',
  },
  editor: {
    label: 'Editor',
    className: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  viewer: {
    label: 'Viewer',
    className: 'bg-green-600 text-white hover:bg-green-700',
  },
  leasing_agent: {
    label: 'Leasing Agent',
    className: 'bg-orange-500 text-white hover:bg-orange-600',
  },
};

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, className }) => {
  const config = roleConfig[role] || { label: role, className: 'bg-muted' };

  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
};

export default RoleBadge;
