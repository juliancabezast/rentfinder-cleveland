/**
 * Marker written to `showings.agent_report` when an agent resolves a tour with
 * the one-tap outcome buttons instead of typing a write-up.
 *
 * This text is NOT internal. It flows straight through
 * leasing-tracker-lookup → the public Leasing Tracker, where the property owner
 * reads it verbatim under "Showings y notas del agente". So it has to read like
 * a status the owner cares about, not like a note about our own tooling — the
 * old "(reporte rápido)" leaked the internal mechanism into a client-facing
 * page and said nothing about what happens next.
 *
 * Only the PRESENCE of a marker is load-bearing: the "Missing reports" chip
 * keys off `agent_report IS NULL`, so the wording is free to change.
 */
export const quickReportText = (attended: boolean): string =>
  attended
    ? "Asistió ✅"
    : "No asistió 👻 — en seguimiento para confirmar la visita";
