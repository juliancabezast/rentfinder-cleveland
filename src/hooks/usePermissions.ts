import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/auth';

export interface Permissions {
  // Organizations
  canViewAllOrganizations: boolean;
  canCreateOrganization: boolean;
  canEditOrganizationSettings: boolean;

  // Dashboard
  canViewAllMetrics: boolean;
  canViewAssignedPropertyMetrics: boolean;
  canViewCostDashboard: boolean;
  canViewSystemLogs: boolean;

  // Properties
  canCreateProperty: boolean;
  canEditProperty: boolean;
  canDeleteProperty: boolean;
  canViewAllProperties: boolean;
  canViewAssignedProperties: boolean;
  canChangePropertyStatus: boolean;
  canUploadPhotos: boolean;
  canSetAlternativeProperties: boolean;

  // Leads
  canViewAllLeads: boolean;
  canViewAssignedLeads: boolean;
  canEditLeadInfo: boolean;
  canCreateLead: boolean;
  canChangeLeadStatus: boolean;
  canMarkDoNotContact: boolean;
  canTakeHumanControl: boolean;
  canReleaseHumanControl: boolean;

  // Showings
  canViewAllShowings: boolean;
  canViewAssignedShowings: boolean;
  canScheduleShowing: boolean;
  canSubmitShowingReport: boolean;
  canCancelRescheduleShowing: boolean;
  canViewOwnRoute: boolean;

  // Calls & Communications
  canViewAllCallLogs: boolean;
  canViewAssignedCallLogs: boolean;
  canListenToRecordings: boolean;
  canInitiateManualCall: boolean;

  // Reports & Analytics
  canViewAllReports: boolean;
  canViewInvestorReports: boolean;
  canExportData: boolean;
  canAccessInsightGenerator: boolean;

  // User Management
  canCreateUsers: boolean;
  canEditUsers: boolean;
  canDeleteUsers: boolean;
  canAssignPropertiesToInvestors: boolean;
  canAssignLeadsToAgents: boolean;

  // System Settings
  canViewSettings: boolean;
  canModifySettings: boolean;
  canToggleFeatures: boolean;

  // FAQ/Documents
  canViewDocuments: boolean;
  canCreateEditDocuments: boolean;
  canDeleteDocuments: boolean;

  // Consent
  canViewConsentLog: boolean;
}

const createPermissions = (role: AppRole | null): Permissions => {
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';
  const isViewer = role === 'viewer';
  const isLeasingAgent = role === 'leasing_agent';

  const isAdminOrAbove = isSuperAdmin || isAdmin;
  const isEditorOrAbove = isAdminOrAbove || isEditor;

  return {
    // Organizations
    canViewAllOrganizations: isSuperAdmin,
    canCreateOrganization: isSuperAdmin,
    canEditOrganizationSettings: isAdminOrAbove,

    // Dashboard
    canViewAllMetrics: isEditorOrAbove,
    canViewAssignedPropertyMetrics: true, // All roles
    canViewCostDashboard: isAdminOrAbove,
    canViewSystemLogs: isAdminOrAbove,

    // Properties
    canCreateProperty: isEditorOrAbove,
    canEditProperty: isEditorOrAbove,
    canDeleteProperty: isAdminOrAbove,
    canViewAllProperties: isEditorOrAbove || isLeasingAgent,
    canViewAssignedProperties: true, // All roles
    canChangePropertyStatus: isEditorOrAbove,
    canUploadPhotos: isEditorOrAbove,
    canSetAlternativeProperties: isEditorOrAbove,

    // Leads
    canViewAllLeads: isEditorOrAbove,
    canViewAssignedLeads: isEditorOrAbove || isLeasingAgent,
    canEditLeadInfo: isEditorOrAbove || isLeasingAgent,
    canCreateLead: isEditorOrAbove || isLeasingAgent,
    canChangeLeadStatus: isEditorOrAbove || isLeasingAgent,
    canMarkDoNotContact: isEditorOrAbove,
    canTakeHumanControl: isEditorOrAbove || isLeasingAgent,
    canReleaseHumanControl: isEditorOrAbove || isLeasingAgent,

    // Showings
    canViewAllShowings: isEditorOrAbove,
    canViewAssignedShowings: isEditorOrAbove || isLeasingAgent,
    canScheduleShowing: isEditorOrAbove || isLeasingAgent,
    canSubmitShowingReport: isEditorOrAbove || isLeasingAgent,
    canCancelRescheduleShowing: isEditorOrAbove || isLeasingAgent,
    canViewOwnRoute: isEditorOrAbove || isLeasingAgent,

    // Calls & Communications
    canViewAllCallLogs: isEditorOrAbove,
    canViewAssignedCallLogs: isEditorOrAbove || isLeasingAgent,
    canListenToRecordings: isEditorOrAbove || isLeasingAgent,
    canInitiateManualCall: isEditorOrAbove || isLeasingAgent,

    // Reports & Analytics
    canViewAllReports: isEditorOrAbove,
    canViewInvestorReports: isEditorOrAbove || isViewer,
    canExportData: isEditorOrAbove,
    canAccessInsightGenerator: isEditorOrAbove,

    // User Management
    canCreateUsers: isAdminOrAbove,
    canEditUsers: isAdminOrAbove,
    canDeleteUsers: isAdminOrAbove,
    canAssignPropertiesToInvestors: isEditorOrAbove,
    canAssignLeadsToAgents: isEditorOrAbove,

    // System Settings
    canViewSettings: isEditorOrAbove,
    canModifySettings: isAdminOrAbove,
    canToggleFeatures: isAdminOrAbove,

    // FAQ/Documents
    canViewDocuments: isEditorOrAbove || isLeasingAgent,
    canCreateEditDocuments: isEditorOrAbove,
    canDeleteDocuments: isAdminOrAbove,

    // Consent
    canViewConsentLog: isEditorOrAbove || isLeasingAgent,
  };
};

export const usePermissions = (): Permissions => {
  const { userRecord } = useAuth();

  const permissions = useMemo(() => {
    return createPermissions(userRecord?.role ?? null);
  }, [userRecord?.role]);

  return permissions;
};

export const hasRole = (userRole: AppRole | null, allowedRoles: AppRole[]): boolean => {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
};
