import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Plus,
  X,
  RotateCcw,
  Save,
  Send,
  Eye,
  Pencil,
  CalendarCheck,
  UserX,
  ThumbsUp,
  HandMetal,
  Braces,
  Ban,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { supabase } from "@/integrations/supabase/client";
import {
  type EmailTemplateType,
  type EmailTemplateConfig,
  type EmailTemplatesMap,
  type EmailButton,
  TEMPLATE_TYPES,
  TEMPLATE_META,
  TEMPLATE_VARIABLES,
  DEFAULT_CONFIGS,
  SAMPLE_VARIABLES,
  renderEmailHtml,
} from "@/lib/emailTemplateDefaults";

interface EmailTemplatesTabProps {
  refreshKey: number;
}

const TEMPLATE_ICONS: Record<EmailTemplateType, React.ElementType> = {
  welcome: HandMetal,
  schedule_showing: Send,
  showing_confirmation: CalendarCheck,
  no_show: UserX,
  post_showing: ThumbsUp,
  cancelled_showing: Ban,
  rescheduled_showing: CalendarClock,
};

// Human-friendly labels for template variables
const VARIABLE_LABELS: Record<string, string> = {
  "{firstName}": "First Name",
  "{fullName}": "Full Name",
  "{propertyAddress}": "Property Address",
  "{propertyRent}": "Rent Price",
  "{propertyBeds}": "Bedrooms",
  "{propertyBaths}": "Bathrooms",
  "{orgName}": "Organization Name",
  "{senderDomain}": "Website Domain",
  "{showingDate}": "Showing Date/Time",
};

/** Small "{ }" button that opens a variable picker popover. Inserts at cursor position. */
const VariableDropdown: React.FC<{
  variables: string[];
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onInsert: (newValue: string) => void;
  currentValue: string;
}> = ({ variables, inputRef, onInsert, currentValue }) => {
  const [open, setOpen] = useState(false);

  const handleInsert = (variable: string) => {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? currentValue.length;
    const before = currentValue.slice(0, cursor);
    const after = currentValue.slice(cursor);
    onInsert(before + variable + after);
    setOpen(false);
    // Restore focus and cursor after insert
    setTimeout(() => {
      if (el) {
        el.focus();
        const newPos = cursor + variable.length;
        el.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-primary"
          title="Insert smart field"
        >
          <Braces className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">Insert Field</div>
        {variables.map((v) => (
          <button
            key={v}
            onClick={() => handleInsert(v)}
            className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-primary/10 transition-colors flex items-center justify-between gap-2"
          >
            <span className="font-medium">{VARIABLE_LABELS[v] || v}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{v}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

export const EmailTemplatesTab: React.FC<EmailTemplatesTabProps> = ({ refreshKey }) => {
  const { toast } = useToast();
  const { userRecord } = useAuth();
  const { getSetting, updateSetting, loading: settingsLoading } = useOrganizationSettings();

  const [selectedType, setSelectedType] = useState<EmailTemplateType>("welcome");
  const [config, setConfig] = useState<EmailTemplateConfig>(DEFAULT_CONFIGS.welcome);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Load saved templates from org settings
  const loadConfig = useCallback(
    (type: EmailTemplateType) => {
      const saved = getSetting<EmailTemplatesMap>("email_templates", {});
      const templateConfig = saved?.[type] || DEFAULT_CONFIGS[type];
      setConfig(JSON.parse(JSON.stringify(templateConfig)));
      setIsDirty(false);
    },
    [getSetting]
  );

  useEffect(() => {
    if (!settingsLoading) loadConfig(selectedType);
  }, [selectedType, settingsLoading, refreshKey, loadConfig]);

  // Update a config field
  const update = <K extends keyof EmailTemplateConfig>(
    key: K,
    value: EmailTemplateConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  // Dynamic paragraph management
  const updateParagraph = (index: number, value: string) => {
    const updated = [...config.bodyParagraphs];
    updated[index] = value;
    update("bodyParagraphs", updated);
  };
  const addParagraph = () => update("bodyParagraphs", [...config.bodyParagraphs, ""]);
  const removeParagraph = (index: number) => {
    if (config.bodyParagraphs.length <= 1) return;
    update("bodyParagraphs", config.bodyParagraphs.filter((_, i) => i !== index));
  };

  // Dynamic button management
  const updateButton = (index: number, field: keyof EmailButton, value: string) => {
    const updated = [...config.buttons];
    updated[index] = { ...updated[index], [field]: value };
    update("buttons", updated);
  };
  const addButton = () =>
    update("buttons", [
      ...config.buttons,
      { text: "Click Here", url: "https://{senderDomain}", style: "primary" as const },
    ]);
  const removeButton = (index: number) =>
    update("buttons", config.buttons.filter((_, i) => i !== index));

  // Dynamic step management
  const updateStep = (index: number, value: string) => {
    const updated = [...(config.stepTexts || [])];
    updated[index] = value;
    update("stepTexts", updated);
  };
  const addStep = () => update("stepTexts", [...(config.stepTexts || []), ""]);
  const removeStep = (index: number) => {
    const steps = config.stepTexts || [];
    if (steps.length <= 1) return;
    update("stepTexts", steps.filter((_, i) => i !== index));
  };

  // Build preview variables (merge sample with org-specific)
  const previewVars = useMemo(() => {
    const orgName = getSetting<string>("org_name", SAMPLE_VARIABLES["{orgName}"]);
    const senderDomain = getSetting<string>("sender_domain", SAMPLE_VARIABLES["{senderDomain}"]);
    return {
      ...SAMPLE_VARIABLES,
      "{orgName}": orgName || SAMPLE_VARIABLES["{orgName}"],
      "{senderDomain}": senderDomain || SAMPLE_VARIABLES["{senderDomain}"],
    };
  }, [getSetting]);

  // Live preview HTML
  const previewHtml = useMemo(
    () => renderEmailHtml(config, previewVars),
    [config, previewVars]
  );

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existing = getSetting<EmailTemplatesMap>("email_templates", {});
      const updated: EmailTemplatesMap = { ...existing, [selectedType]: config };
      await updateSetting("email_templates", updated as unknown as Record<string, unknown>, "communications");
      setIsDirty(false);
      toast({ title: "Template saved", description: `${TEMPLATE_META[selectedType].label} template updated. Changes take effect on next send.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save the template. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIGS[selectedType])));
    setIsDirty(true);
  };

  // Send test email
  const handleSendTest = async () => {
    if (!userRecord?.email) {
      toast({ title: "No email", description: "Your account has no email address.", variant: "destructive" });
      return;
    }
    setIsSendingTest(true);
    try {
      const html = renderEmailHtml(config, previewVars);
      const subject = Object.entries(previewVars).reduce(
        (s, [k, v]) => s.replaceAll(k, v),
        config.subject
      );
      await supabase.functions.invoke("send-notification-email", {
        body: {
          to: userRecord.email,
          subject: `[TEST] ${subject}`,
          html,
          notification_type: "test",
          organization_id: userRecord.organization_id,
          queue: false,
        },
      });
      toast({ title: "Test sent", description: `Preview email sent to ${userRecord.email}` });
    } catch {
      toast({ title: "Send failed", variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Switch template with dirty check
  const handleTypeChange = (type: string) => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSelectedType(type as EmailTemplateType);
  };

  const variables = TEMPLATE_VARIABLES[selectedType];

  // Refs for variable insertion at cursor
  const subjectRef = useRef<HTMLInputElement>(null);
  const headerTitleRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLInputElement>(null);
  const paragraphRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const stepRefs = useRef<(HTMLInputElement | null)[]>([]);

  return (
    <div className="space-y-4">
      {/* Template type selector */}
      <Tabs value={selectedType} onValueChange={handleTypeChange}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          {TEMPLATE_TYPES.map((type) => {
            const Icon = TEMPLATE_ICONS[type];
            return (
              <TabsTrigger key={type} value={type} className="gap-1.5">
                <Icon className="h-4 w-4" />
                {TEMPLATE_META[type].label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <p className="text-sm text-muted-foreground">{TEMPLATE_META[selectedType].description}</p>

      {/* Split layout: editor + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Editor */}
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Template
              {isDirty && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 ml-auto">
                  Unsaved changes
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Subject */}
            <div className="space-y-1.5">
              <Label>Subject Line</Label>
              <div className="flex gap-1">
                <Input
                  ref={subjectRef}
                  value={config.subject}
                  onChange={(e) => update("subject", e.target.value)}
                  placeholder="Email subject..."
                  className="flex-1"
                />
                <VariableDropdown
                  variables={variables}
                  inputRef={subjectRef}
                  currentValue={config.subject}
                  onInsert={(v) => update("subject", v)}
                />
              </div>
            </div>

            {/* Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Header Title</Label>
                <div className="flex gap-1">
                  <Input
                    ref={headerTitleRef}
                    value={config.headerTitle}
                    onChange={(e) => update("headerTitle", e.target.value)}
                    className="flex-1"
                  />
                  <VariableDropdown
                    variables={variables}
                    inputRef={headerTitleRef}
                    currentValue={config.headerTitle}
                    onInsert={(v) => update("headerTitle", v)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Subtitle (optional)</Label>
                <div className="flex gap-1">
                  <Input
                    ref={subtitleRef}
                    value={config.headerSubtitle || ""}
                    onChange={(e) => update("headerSubtitle", e.target.value || undefined)}
                    placeholder="Optional subtitle..."
                    className="flex-1"
                  />
                  <VariableDropdown
                    variables={variables}
                    inputRef={subtitleRef}
                    currentValue={config.headerSubtitle || ""}
                    onInsert={(v) => update("headerSubtitle", v || undefined)}
                  />
                </div>
              </div>
            </div>

            {/* Body paragraphs */}
            <div className="space-y-2">
              <Label>Body Paragraphs</Label>
              {config.bodyParagraphs.map((p, i) => (
                <div key={i} className="flex gap-1">
                  <Textarea
                    ref={(el) => { paragraphRefs.current[i] = el; }}
                    value={p}
                    onChange={(e) => updateParagraph(i, e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-1">
                    <VariableDropdown
                      variables={variables}
                      inputRef={{ current: paragraphRefs.current[i] }}
                      currentValue={p}
                      onInsert={(v) => updateParagraph(i, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => removeParagraph(i)}
                      disabled={config.bodyParagraphs.length <= 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addParagraph} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Paragraph
              </Button>
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <Label>Buttons / CTAs</Label>
              {config.buttons.map((btn, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center p-3 border rounded-lg bg-muted/30">
                  <Input
                    value={btn.text}
                    onChange={(e) => updateButton(i, "text", e.target.value)}
                    placeholder="Button text"
                    className="flex-1 min-w-[120px]"
                  />
                  <Input
                    value={btn.url}
                    onChange={(e) => updateButton(i, "url", e.target.value)}
                    placeholder="URL"
                    className="flex-1 min-w-[160px]"
                  />
                  <Select
                    value={btn.style}
                    onValueChange={(v) => updateButton(i, "style", v)}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9 text-muted-foreground hover:text-red-500"
                    onClick={() => removeButton(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addButton} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Button
              </Button>
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Sections</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm">Property Details Card</span>
                <Switch
                  checked={config.showPropertyCard}
                  onCheckedChange={(v) => update("showPropertyCard", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Numbered Steps (1-2-3)</span>
                <Switch
                  checked={config.showSteps}
                  onCheckedChange={(v) => update("showSteps", v)}
                />
              </div>
              {config.showSteps && (
                <div className="space-y-2 pl-4 border-l-2 border-muted">
                  {(config.stepTexts || []).map((step, i) => (
                    <div key={i} className="flex gap-1 items-center">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                      <Input
                        ref={(el) => { stepRefs.current[i] = el; }}
                        value={step}
                        onChange={(e) => updateStep(i, e.target.value)}
                        className="flex-1"
                      />
                      <VariableDropdown
                        variables={variables}
                        inputRef={{ current: stepRefs.current[i] }}
                        currentValue={step}
                        onInsert={(v) => updateStep(i, v)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => removeStep(i)}
                        disabled={(config.stepTexts || []).length <= 1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {(config.stepTexts || []).length < 5 && (
                    <Button variant="ghost" size="sm" onClick={addStep} className="gap-1 text-xs">
                      <Plus className="h-3 w-3" /> Add Step
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm">Section 8 Voucher Badge</span>
                <Switch
                  checked={config.showSection8Badge}
                  onCheckedChange={(v) => update("showSection8Badge", v)}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="space-y-1.5">
              <Label>Footer Text</Label>
              <div className="flex gap-1">
                <Input
                  ref={footerRef}
                  value={config.footerText}
                  onChange={(e) => update("footerText", e.target.value)}
                  className="flex-1"
                />
                <VariableDropdown
                  variables={variables}
                  inputRef={footerRef}
                  currentValue={config.footerText}
                  onInsert={(v) => update("footerText", v)}
                />
              </div>
            </div>

            {/* Variable reference */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Available Fields — use <Braces className="inline h-3 w-3" /> to insert</Label>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(v);
                      toast({ title: "Copied", description: `${v} copied to clipboard` });
                    }}
                  >
                    {VARIABLE_LABELS[v] || v} <span className="text-[10px] text-muted-foreground ml-1 font-mono">{v}</span>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="gap-1.5"
              >
                <Send className={cn("h-3.5 w-3.5", isSendingTest && "animate-pulse")} />
                {isSendingTest ? "Sending..." : "Send Test"}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                className="gap-1.5 ml-auto"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Live Preview */}
        <Card variant="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-[#f4f1f1]">
              <iframe
                title="Email Preview"
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ minHeight: 600 }}
                sandbox="allow-same-origin"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
