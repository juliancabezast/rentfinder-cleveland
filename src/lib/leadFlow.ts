/**
 * What actually happens to a lead, as data.
 *
 * This is a MAP OF REALITY, not a wish list. Every step here was traced to the
 * DB trigger or dispatcher handler that really sends it, and `notificationKey`
 * joins each one to its live send/open counts. If a step is not in the code, it
 * is not in this file — `PROJECT.md` describes transitions like
 * "new → contacted after the first AI email" that were never implemented, and
 * putting them on the map would make the diagram lie.
 *
 * `copySource` is the uncomfortable but necessary part. Seven templates are
 * editable in the UI, but only the ones an owner has actually SAVED live in
 * `organization_settings.email_templates`; the rest fall through to builders
 * hardcoded in the dispatcher, and the two differ. A step marked `"code"` will
 * NOT change when you edit its template until you press Save once.
 */

export type CopySource =
  /** Reads organization_settings.email_templates — editing it changes the send. */
  | "saved-template"
  /** Falls through to a hardcoded builder in the dispatcher until saved once. */
  | "code"
  /** No template key exists at all; the copy only lives in the edge function. */
  | "code-only";

export type FlowChannel = "email" | "telegram";

export interface FlowStep {
  id: string;
  label: string;
  /** What causes this step. Plain language — this is owner-facing. */
  trigger: string;
  /** Human delay, e.g. "30 segundos después", "24 h antes". */
  delay: string;
  channel: FlowChannel;
  /** Joins to report_flow_step_stats.step_key. Null when it sends no email. */
  notificationKey: string | null;
  copySource: CopySource;
  /** Template key in emailTemplateDefaults, when one exists. */
  templateKey?: string;
  /** Where the code lives, so the map can be audited against the source. */
  source: string;
  /** Conditions that take a lead OUT of this branch. */
  exits?: string[];
}

export interface FlowBranch {
  id: string;
  label: string;
  /** The condition that sends a lead down this branch. */
  condition: string;
  tone: "positive" | "neutral" | "warning";
  steps: FlowStep[];
}

export interface LeadFlow {
  entry: { label: string; sources: string[] };
  /** Runs for every lead, before any branch. */
  common: FlowStep[];
  branches: FlowBranch[];
}

export const LEAD_FLOW: LeadFlow = {
  entry: {
    label: "Entra un lead",
    sources: [
      "Formulario público (capture-lead / submit-inquiry)",
      "Correo de Hemlane (Esther lo parsea)",
      "Reserva directa desde la página de showings",
    ],
  },

  common: [
    {
      id: "welcome",
      label: "Bienvenida",
      trigger: "Cualquier lead nuevo con teléfono o correo",
      delay: "30 segundos después",
      channel: "email",
      notificationKey: "welcome_sequence",
      copySource: "saved-template",
      templateKey: "welcome",
      source: "trigger trg_sprint2_welcome_task → dispatcher handleWelcomeSequence",
      exits: ["No se manda a leads de llamada entrante"],
    },
    {
      id: "hemlane_info",
      label: "Pedido de datos (solo Hemlane)",
      trigger: "El correo de Hemlane llegó sin datos suficientes",
      delay: "Inmediato",
      channel: "email",
      notificationKey: "lead_info_request",
      copySource: "code-only",
      source: "agent-hemlane-parser (HTML embebido en la función)",
    },
    {
      id: "hemlane_followup",
      label: "Reintento de enriquecimiento",
      trigger: "El lead de Hemlane sigue sin completar datos",
      delay: "48 horas después",
      channel: "email",
      notificationKey: null,
      copySource: "code-only",
      source: "agent-hemlane-parser scheduleEnrichmentFollowup → dispatcher esther",
    },
  ],

  branches: [
    {
      id: "booked",
      label: "Agendó un showing",
      condition: "El lead reserva una visita",
      tone: "positive",
      steps: [
        {
          id: "booking_confirmation",
          label: "Confirmación de reserva",
          trigger: "Apenas reserva",
          delay: "Inmediato",
          channel: "email",
          notificationKey: "showing_confirmation",
          copySource: "code-only",
          source: "book-public-showing (incluye link de Google Calendar y .ics)",
        },
        {
          id: "confirmation_reminder",
          label: "Recordatorio de la visita",
          trigger: "La visita sigue en pie",
          delay: "24 horas antes",
          channel: "email",
          notificationKey: null,
          copySource: "code",
          templateKey: "showing_confirmation",
          source: "cron schedule_showing_confirmations → dispatcher handleShowingConfirmation",
        },
        {
          id: "team_reminder",
          label: "Aviso al equipo",
          trigger: "Falta media hora para la visita",
          delay: "30 minutos antes",
          channel: "telegram",
          notificationKey: null,
          copySource: "code-only",
          source: "showing-reminder (va al bot, NUNCA al inquilino)",
        },
      ],
    },
    {
      id: "showed",
      label: "Asistió",
      condition: "La visita se marca como completada",
      tone: "positive",
      steps: [
        {
          id: "post_showing",
          label: "Siguientes pasos",
          trigger: "El showing quedó en completado",
          delay: "1 hora después",
          channel: "email",
          notificationKey: "post_showing",
          copySource: "code",
          templateKey: "post_showing",
          source: "trigger auto_task_post_showing → dispatcher handlePostShowing",
          exits: ["No corre si la visita es de hace más de 48 h"],
        },
      ],
    },
    {
      id: "no_show",
      label: "No asistió",
      condition: "La visita se marca como no-show",
      tone: "warning",
      steps: [
        {
          id: "no_show_followup",
          label: "Seguimiento de ausencia",
          trigger: "El showing quedó en no-show",
          delay: "2 horas después",
          channel: "email",
          notificationKey: "no_show_followup",
          copySource: "code",
          templateKey: "no_show",
          source: "trigger auto_task_noshow → dispatcher handleNoShowFollowup",
          exits: ["No corre si la visita es de hace más de 48 h"],
        },
      ],
    },
    {
      id: "nurture",
      label: "No agendó",
      condition: "Nunca reservó una visita — se inscribe a mano",
      tone: "neutral",
      steps: [
        {
          id: "nurture_sequence",
          label: "Secuencia de 7 correos",
          trigger: "Inscripción manual (no hay cron ni botón todavía)",
          delay: "Uno cada 3 días",
          channel: "email",
          notificationKey: "showing_nurture",
          copySource: "code-only",
          source: "dispatcher NURTURE_STEPS — los 7 textos están fijos en el código",
          exits: [
            "Agenda una visita → sale como 'booked'",
            "Responde un correo → sale como 'replied'",
            "Se da de baja o pasa a perdido/convertido → 'stopped'",
            "Termina el paso 7 → 'exhausted'",
          ],
        },
      ],
    },
  ],
};

/** Every step, flattened — for joining stats and counting coverage. */
export function allFlowSteps(flow: LeadFlow = LEAD_FLOW): FlowStep[] {
  return [...flow.common, ...flow.branches.flatMap((b) => b.steps)];
}

export const COPY_SOURCE_LABEL: Record<CopySource, string> = {
  "saved-template": "Plantilla guardada",
  code: "Sale del código",
  "code-only": "Solo en el código",
};

export const COPY_SOURCE_HELP: Record<CopySource, string> = {
  "saved-template":
    "Este correo lee la plantilla guardada. Lo que edites acá cambia lo que se envía.",
  code:
    "Existe una plantilla editable, pero como nunca se guardó, el envío sale de un texto fijo en el código y los dos NO coinciden. Guardá la plantilla una vez para tomar el control.",
  "code-only":
    "No hay plantilla para este correo: el texto vive dentro de la función y cambiarlo requiere desplegar.",
};
