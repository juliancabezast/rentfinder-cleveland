import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Save, AlertTriangle, Shield, ImageIcon } from 'lucide-react';
import { useOrganizationSettings, DEFAULT_SETTINGS } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';

export const ComplianceTab: React.FC = () => {
  const { getSetting, updateMultipleSettings, loading } = useOrganizationSettings();
  const [saving, setSaving] = useState(false);

  const [recordingDisclosure, setRecordingDisclosure] = useState('');
  const [autoPurgeDays, setAutoPurgeDays] = useState(180);
  const [tcpaConsentLanguage, setTcpaConsentLanguage] = useState('');
  const [photoUploadRestricted, setPhotoUploadRestricted] = useState(false);

  useEffect(() => {
    if (!loading) {
      setRecordingDisclosure(getSetting('recording_disclosure_text', DEFAULT_SETTINGS.recording_disclosure_text));
      setAutoPurgeDays(getSetting('auto_purge_leads_days', DEFAULT_SETTINGS.auto_purge_leads_days));
      setTcpaConsentLanguage(getSetting('tcpa_consent_language', DEFAULT_SETTINGS.tcpa_consent_language));
      setPhotoUploadRestricted(getSetting('photo_upload_restricted', false));
    }
  }, [loading, getSetting]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: 'recording_disclosure_text', value: recordingDisclosure, category: 'compliance' },
        { key: 'auto_purge_leads_days', value: autoPurgeDays, category: 'compliance' },
        { key: 'tcpa_consent_language', value: tcpaConsentLanguage, category: 'compliance' },
        { key: 'photo_upload_restricted', value: photoUploadRestricted, category: 'security' },
      ]);

      toast.success('Compliance and security settings have been updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoRestrictionChange = (checked: boolean) => {
    setPhotoUploadRestricted(checked);
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-3">
        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Legal Compliance:</strong> These settings affect TCPA and recording consent requirements.
          Consult with legal counsel before making changes.
        </div>
      </div>

      {/* Photo Upload Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Photo Upload Permissions
          </CardTitle>
          <CardDescription>
            Control who can upload and manage property photos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="photoRestricted">Restrict to Admins Only</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, only administrators can upload, update, or delete property photos.
                When disabled, editors can also manage photos.
              </p>
            </div>
            <Switch
              id="photoRestricted"
              checked={photoUploadRestricted}
              onCheckedChange={handlePhotoRestrictionChange}
            />
          </div>
          
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium mb-2">Current permissions:</p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              <li>Super Admin: Always allowed</li>
              <li>Admin: Always allowed</li>
              <li>Editor: {photoUploadRestricted ? <span className="text-destructive">Not allowed</span> : <span className="text-green-600">Allowed</span>}</li>
              <li>Viewer: Not allowed</li>
              <li>Leasing Agent: Not allowed</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call Recording Disclosure</CardTitle>
          <CardDescription>
            This message is played at the start of every call for compliance with state wiretapping laws
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recordingDisclosure">Recording Disclosure Text</Label>
            <Textarea
              id="recordingDisclosure"
              value={recordingDisclosure}
              onChange={(e) => setRecordingDisclosure(e.target.value)}
              rows={4}
              placeholder="This call may be recorded for quality assurance..."
            />
            <p className="text-xs text-muted-foreground">
              Required for two-party consent states (CA, CT, FL, IL, MD, MA, MI, MT, NV, NH, OR, PA, VT, WA)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TCPA Consent Language</CardTitle>
          <CardDescription>
            The consent text shown in lead capture forms and popups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tcpaConsentLanguage">Consent Language</Label>
            <Textarea
              id="tcpaConsentLanguage"
              value={tcpaConsentLanguage}
              onChange={(e) => setTcpaConsentLanguage(e.target.value)}
              rows={4}
              placeholder="By providing my phone number..."
            />
            <p className="text-xs text-muted-foreground">
              Must clearly indicate consent to automated calls/texts. Cannot be pre-checked.
            </p>
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              This text must be displayed with a checkbox that users must manually check.
              Pre-checked boxes violate TCPA requirements.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Retention</CardTitle>
          <CardDescription>Configure automatic data purging for privacy compliance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="autoPurgeDays">Auto-Purge Inactive Leads After (days)</Label>
            <Input
              id="autoPurgeDays"
              type="number"
              min={30}
              max={730}
              value={autoPurgeDays}
              onChange={(e) => setAutoPurgeDays(parseInt(e.target.value) || 180)}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Leads without activity will be automatically purged after this period.
              Set to comply with CCPA and GDPR data minimization requirements.
            </p>
          </div>

          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm">
              Current setting: Inactive leads will be purged after <strong>{autoPurgeDays} days</strong> (~{Math.round(autoPurgeDays / 30)} months)
            </p>
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

export default ComplianceTab;
