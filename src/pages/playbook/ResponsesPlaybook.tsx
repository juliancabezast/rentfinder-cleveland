import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquareText,
  Calendar,
  ClipboardCheck,
  BadgeCheck,
  PawPrint,
  DoorOpen,
  DollarSign,
  FileText,
  Copy,
  Check,
  Pencil,
  Save,
  X,
  Sparkles,
  Home,
  Droplet,
  ShieldCheck,
  Scale,
  UserPlus,
  Clock,
  FileSearch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Response categories: id · ES label · icon · match keywords · default copy ──
interface Category {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kw: string[];
  resp: string;
}

const CATEGORIES: Category[] = [
  {
    id: "schedule",
    label: "Agendar showing",
    icon: Calendar,
    kw: ["schedule", "tour", "see", "view", "showing", "visit", "appointment", "agendar", "book"],
    resp:
      "Hi {name}! I'd love to get you in to see the home. Book a tour instantly here: rentfindercleveland.com/p/book-showing — just pick a time that works for you.",
  },
  {
    id: "requirements",
    label: "Requisitos",
    icon: ClipboardCheck,
    kw: ["requirements", "qualify", "credit", "income", "background", "criteria", "requisitos", "proof"],
    resp:
      "Great question! To apply you'll need a valid photo ID, your last 3 paystubs (income about 3× the rent), and a $50 application fee per household. We welcome housing vouchers too.",
  },
  {
    id: "vouchers",
    label: "Vouchers / Sección 8",
    icon: BadgeCheck,
    kw: ["voucher", "section 8", "section8", "housing", "subsidy", "chha", "cmha"],
    resp:
      "Yes — we happily accept Section 8 / housing vouchers on many of our homes! Let me know your voucher's bedroom size and I'll point you to the best fits.",
  },
  {
    id: "pets",
    label: "Mascotas",
    icon: PawPrint,
    kw: ["pet", "dog", "cat", "animal", "puppy", "esa", "service animal", "mascota"],
    resp:
      "Thanks for asking! Pet policy varies by home — many of ours are pet-friendly with a small pet deposit. What kind of pet do you have?",
  },
  {
    id: "availability",
    label: "Disponibilidad",
    icon: DoorOpen,
    kw: ["available", "still", "open", "when", "move in", "move-in", "ready", "disponible"],
    resp:
      "Yes, it's still available! Would you like to schedule a tour? Book instantly here: rentfindercleveland.com/p/book-showing",
  },
  {
    id: "pricing",
    label: "Precio / Depósito",
    icon: DollarSign,
    kw: ["price", "rent", "deposit", "cost", "how much", "fee", "precio", "deposito"],
    resp:
      "The rent and deposit for each home are on its page at rentfindercleveland.com. Deposit is typically one month's rent. Want me to send you the direct link?",
  },
  {
    id: "leased",
    label: "Ya rentada / no disponible",
    icon: Home,
    kw: ["leased", "rented", "taken", "no longer", "already gone", "unavailable", "gone", "off the market", "someone else"],
    resp:
      "Thanks so much for reaching out! That specific home is already leased — but we have several great options available very close by. Take a look and book a tour instantly at rentfindercleveland.com — I'd love to help you find your next place!",
  },
  {
    id: "utilities",
    label: "Servicios (agua / luz / gas)",
    icon: Droplet,
    kw: ["water", "sewer", "utilities", "utility", "electric", "electricity", "gas", "trash", "who pays", "do i pay", "included"],
    resp:
      "Great question! On our multi-family homes you only pay electricity and gas — water and sewer are included in the rent. Want to see it in person? Book a tour at rentfindercleveland.com!",
  },
  {
    id: "evictions",
    label: "Desalojos / historial",
    icon: Scale,
    kw: ["eviction", "evicted", "evictions", "prior eviction", "court", "filing", "unlawful detainer"],
    resp:
      "Thanks for being upfront — I appreciate it. We review every application individually and look at the full picture, not any single item. The best next step is to apply so our team can take a look: rentfindercleveland.com.",
  },
  {
    id: "background",
    label: "Background / crédito",
    icon: FileSearch,
    kw: ["background", "credit", "criminal", "felony", "score", "record", "check"],
    resp:
      "We run a standard background and credit check with every application, and we review each one on a case-by-case basis. Go ahead and apply and our team will take it from there: rentfindercleveland.com.",
  },
  {
    id: "cosigner",
    label: "Co-firmante / garante",
    icon: UserPlus,
    kw: ["cosigner", "co-signer", "co signer", "guarantor", "co-sign"],
    resp:
      "Yes — a qualified co-signer or guarantor can help strengthen an application. Start the application here and add their info during the process: rentfindercleveland.com.",
  },
  {
    id: "appstatus",
    label: "Estado de aplicación",
    icon: Clock,
    kw: ["status", "approved", "decision", "hear back", "application status", "when will i know", "any update"],
    resp:
      "Thanks for your patience, {name}! Our team reviews applications in the order they come in and will reach out with next steps. If it's been a few days, just reply here and I'll check on it for you.",
  },
  {
    id: "apply",
    label: "Aplicar",
    icon: FileText,
    kw: ["apply", "application", "aplicar", "how do i apply"],
    resp:
      "Awesome — ready to apply! Start your rental application here: rentfindercleveland.com. You'll need a valid ID, your last 3 paystubs, and the $50 application fee per household.",
  },
];

const DEFAULTS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.resp]));

// Pure: best-matching category id by keyword-hit count, or null.
function detectCategory(message: string): string | null {
  const t = message.toLowerCase();
  if (!t.trim()) return null;
  let bestId: string | null = null;
  let bestScore = 0;
  for (const c of CATEGORIES) {
    let score = 0;
    for (const k of c.kw) if (t.includes(k.toLowerCase())) score++;
    if (score > bestScore) { bestScore = score; bestId = c.id; }
  }
  return bestScore >= 1 ? bestId : null;
}

export default function ResponsesPlaybook() {
  const { userRecord } = useAuth();
  const { toast } = useToast();
  const orgId = userRecord?.organization_id;

  const [message, setMessage] = useState("");
  const [leadName, setLeadName] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>(DEFAULTS);
  // Replace the {name} placeholder live with whatever's typed (or a neutral fallback).
  const resolve = (text: string) => (text || "").replaceAll("{name}", leadName.trim() || "there");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load saved templates; merge over defaults so new categories still appear.
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("organization_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "lead_response_templates")
        .maybeSingle();
      const saved = data?.value
        ? typeof data.value === "string"
          ? JSON.parse(data.value)
          : (data.value as Record<string, string>)
        : {};
      const merged: Record<string, string> = {};
      for (const c of CATEGORIES) merged[c.id] = saved?.[c.id] ?? c.resp;
      setResponses(merged);
    })();
  }, [orgId]);

  const detected = useMemo(() => detectCategory(message), [message]);

  // Emphasize + scroll to the detected card.
  useEffect(() => {
    if (detected && cardRefs.current[detected]) {
      cardRefs.current[detected]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [detected]);

  const copy = (id: string) => {
    navigator.clipboard.writeText(resolve(responses[id] || ""));
    setCopiedId(id);
    setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1500);
    toast({ title: "Copiado al portapapeles" });
  };

  const startEdit = (id: string) => { setEditing(id); setDraft(responses[id] || ""); };

  const saveEdit = async (id: string) => {
    const next = { ...responses, [id]: draft };
    setResponses(next);
    setEditing(null);
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organization_settings")
      .upsert(
        { organization_id: orgId, key: "lead_response_templates", value: next as unknown as string, category: "leads" },
        { onConflict: "organization_id,key" },
      );
    setSaving(false);
    toast(error ? { title: "No se pudo guardar", variant: "destructive" } : { title: "Respuesta guardada" });
  };

  const detectedLabel = CATEGORIES.find((c) => c.id === detected)?.label;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquareText className="h-6 w-6 text-primary" />
          Playbook de respuestas
        </h1>
      </div>

      {/* Paste box + detection */}
      <Card variant="glass">
        <CardContent className="p-3 sm:p-4 space-y-2">
          {/* One compact row: lead name (→ {name}) + paste box */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Nombre del lead → {name}"
              className="h-9 text-sm sm:w-[220px] sm:shrink-0"
            />
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Pegá el mensaje del lead para detectar la categoría…"
              rows={1}
              className="min-h-9 flex-1 resize-none py-2 text-sm"
            />
          </div>
          {detected ? (
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Parece:</span>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20">
                {detectedLabel}
              </Badge>
            </div>
          ) : message.trim() ? (
            <p className="text-xs text-muted-foreground">Sin categoría clara — mirá las opciones abajo.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Category cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((c) => {
          const isMatch = detected === c.id;
          const Icon = c.icon;
          const isEditing = editing === c.id;
          return (
            <div key={c.id} ref={(el) => (cardRefs.current[c.id] = el)}>
              <Card
                variant="glass"
                className={cn(
                  "h-full transition-shadow",
                  isMatch && "ring-2 ring-primary/60 shadow-md",
                )}
              >
                <CardContent className="p-4 space-y-3 flex flex-col h-full">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-semibold text-sm">{c.label}</span>
                    {isMatch && (
                      <Badge className="ml-auto h-5 bg-emerald-500 hover:bg-emerald-500 text-[10px]">coincide</Badge>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={5}
                        className="text-sm resize-none"
                      />
                      <div className="flex gap-2 mt-auto">
                        <Button size="sm" onClick={() => saveEdit(c.id)} disabled={saving} className="gap-1.5">
                          <Save className="h-3.5 w-3.5" /> Guardar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={saving} className="gap-1.5">
                          <X className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-muted-foreground rounded-lg bg-muted/50 p-3 flex-1 whitespace-pre-wrap">
                        {resolve(responses[c.id])}
                      </p>
                      <div className="flex gap-2 mt-auto">
                        <Button
                          size="sm"
                          onClick={() => copy(c.id)}
                          className={cn("gap-1.5 flex-1", copiedId === c.id && "bg-emerald-600 hover:bg-emerald-600")}
                        >
                          {copiedId === c.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === c.id ? "Copiado" : "Copiar"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(c.id)} title="Editar respuesta">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Golden rule — moved to the bottom so the top stays compact */}
      <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-xs text-slate-600">
        <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
        <p>
          <span className="font-semibold text-slate-700">Regla de oro:</span> siempre amigable y concreto, y llevalos a la web a
          <span className="font-semibold text-indigo-600"> agendar en rentfindercleveland.com</span>. Cumplí Fair Housing (Ohio):
          nunca preguntes ni menciones raza, religión, sexo, estado familiar, discapacidad, origen o edad.
        </p>
      </div>
    </div>
  );
}
