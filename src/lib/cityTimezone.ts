// Maps property cities to IANA timezones.
// Default: America/New_York (Cleveland HQ).

const CITY_TZ: Record<string, string> = {
  // Ohio (Eastern)
  "Cleveland": "America/New_York",
  "Akron": "America/New_York",
  "Elyria": "America/New_York",
  "Lorain": "America/New_York",
  "Canton": "America/New_York",
  "Toledo": "America/New_York",
  "Columbus": "America/New_York",
  "Youngstown": "America/New_York",
  "Parma": "America/New_York",
  "Lakewood": "America/New_York",
  "Euclid": "America/New_York",
  "Mentor": "America/New_York",
  "Mansfield": "America/New_York",
  // Wisconsin (Central)
  "Milwaukee": "America/Chicago",
  "Madison": "America/Chicago",
  "Green Bay": "America/Chicago",
  "Kenosha": "America/Chicago",
  "Racine": "America/Chicago",
  // Missouri (Central)
  "Saint Louis": "America/Chicago",
  "St. Louis": "America/Chicago",
  "Kansas City": "America/Chicago",
  "Springfield": "America/Chicago",
  // Illinois (Central)
  "Chicago": "America/Chicago",
  // Indiana (mostly Eastern)
  "Indianapolis": "America/Indiana/Indianapolis",
  // Michigan (Eastern)
  "Detroit": "America/Detroit",
  // Pennsylvania (Eastern)
  "Pittsburgh": "America/New_York",
  "Philadelphia": "America/New_York",
};

const DEFAULT_TZ = "America/New_York";

export function getTimezoneForCity(city: string | null | undefined): string {
  if (!city) return DEFAULT_TZ;
  return CITY_TZ[city] || CITY_TZ[city.trim()] || DEFAULT_TZ;
}

/** Build a timezone-aware ISO string from a date + time in a given IANA timezone */
export function buildScheduledAt(dateStr: string, slotTime: string, timezone: string): string {
  const localDt = new Date(`${dateStr}T12:00:00Z`);
  const localStr = localDt.toLocaleString("en-US", { timeZone: timezone });
  const localParsed = new Date(localStr);
  const offsetMs = localDt.getTime() - localParsed.getTime();
  const offsetHours = Math.round(offsetMs / 3600000);
  const offsetSign = offsetHours >= 0 ? "+" : "-";
  const offsetAbs = String(Math.abs(offsetHours)).padStart(2, "0");
  const tzOffset = `${offsetSign}${offsetAbs}:00`;
  return `${dateStr}T${slotTime}${tzOffset}`;
}

/** Format a UTC/ISO timestamp in the given timezone as "h:mm AM/PM" */
export function formatTimeInTimezone(isoString: string, timezone: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
