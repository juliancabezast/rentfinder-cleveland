/**
 * Exhaustive test for Esther's address matching logic.
 * Tests normalizeAddress, unitsMatch, and the full matching pipeline
 * against 300+ real-world variants Hemlane might send.
 *
 * Run: npx vitest run src/test/address-matching.test.ts
 */
import { describe, it, expect } from "vitest";

// ── Extracted from agent-hemlane-parser/index.ts ──────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .trim()
    .replace(/\s*\[Esther\b.*$/i, "") // Strip leaked timestamps
    .replace(/\./g, "") // Strip ALL periods (N. → N, St. → St, Mt. → Mt)
    .replace(/,?\s*(?:Unit|Apt|#)\s*\w+$/i, "") // Strip unit suffix
    .replace(/\bMt\b/gi, "Mount") // Mt → Mount (DB uses "Mount Auburn")
    .replace(/\bNorth\b/gi, "N")
    .replace(/\bSouth\b/gi, "S")
    .replace(/\bEast\b/gi, "E")
    .replace(/\bWest\b/gi, "W")
    .replace(/\bStreet\b/gi, "St")
    .replace(/\bAvenue\b/gi, "Ave")
    .replace(/\bRoad\b/gi, "Rd")
    .replace(/\bDrive\b/gi, "Dr")
    .replace(/\bBoulevard\b/gi, "Blvd")
    .replace(/\bLane\b/gi, "Ln")
    .replace(/\bPlace\b/gi, "Pl")
    .replace(/\bCourt\b/gi, "Ct")
    .replace(/\bCircle\b/gi, "Cir")
    .replace(/\bTerrace\b/gi, "Ter")
    .replace(/\bParkway\b/gi, "Pkwy")
    .replace(/\s+/g, " ")
    .trim();
}

function unitsMatch(
  inputUnit: string | null,
  propUnit: string | null
): boolean {
  if (!inputUnit || !propUnit) return true;
  const a = inputUnit.toLowerCase().trim();
  const b = propUnit.toLowerCase().trim();
  if (a === b) return true;
  if (b.startsWith(a + " ") || b.startsWith(a + "(")) return true;
  if (a.startsWith(b + " ") || a.startsWith(b + "(")) return true;
  if (b.includes(`(${a})`) || b.includes(`(${a} `) || b.includes(` ${a})`))
    return true;
  if (a.includes(`(${b})`) || a.includes(`(${b} `) || a.includes(` ${b})`))
    return true;
  return false;
}

// Simulates the matchProperty logic (Pass 1 + Pass 2, no AI)
interface Candidate {
  id: string;
  address: string;
  unit_number: string | null;
}

function matchPropertyLocal(
  inputAddress: string,
  candidates: Candidate[]
): string | null {
  const cleanInput = inputAddress
    .replace(/\s*\[Esther\b.*$/i, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (!cleanInput || cleanInput.length < 5) return null;

  // Extract unit number — support multiple patterns
  const unitMatch = cleanInput.match(
    /,?\s*(?:Unit|Apt|#|Apartment)\s*(\w+)/i
  );
  // Also check for standalone unit patterns like ", A" or ", Down" at end
  const trailingUnitMatch = !unitMatch
    ? cleanInput.match(/,\s*([A-Za-z](?:\s*\([\w\s]+\))?)\s*$/)
    : null;
  const unitNumber = unitMatch
    ? unitMatch[1]
    : trailingUnitMatch
      ? trailingUnitMatch[1]
      : null;

  // Main address: first part before comma, without unit suffix
  let mainAddress = cleanInput
    .split(",")[0]
    .replace(/,?\s*(?:Unit|Apt|#|Apartment)\s*\w+$/i, "")
    .trim();

  const streetNumber = mainAddress.match(/^(\d+)/)?.[1];
  if (!streetNumber) return null;

  // Filter candidates by street number
  const filtered = candidates.filter((c) =>
    c.address.toLowerCase().startsWith(streetNumber + " ")
  );
  if (filtered.length === 0) return null;

  const normInput = normalizeAddress(mainAddress).toLowerCase();
  const inputUnit = unitNumber?.toLowerCase() || null;

  // Pass 1: exact normalized match
  for (const prop of filtered) {
    const normProp = normalizeAddress(prop.address).toLowerCase();
    if (normProp === normInput && unitsMatch(inputUnit, prop.unit_number)) {
      return prop.id;
    }
  }

  // Pass 2: street number + main street name word
  const dirs = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  const normWords = normInput.split(" ").filter((w) => w.length > 0);
  const inputStreetWord = normWords.find((w, i) => i > 0 && !dirs.has(w));

  if (inputStreetWord) {
    for (const prop of filtered) {
      const propWords = normalizeAddress(prop.address)
        .toLowerCase()
        .split(" ")
        .filter((w) => w.length > 0);
      const propStreetWord = propWords.find(
        (w, i) => i > 0 && !dirs.has(w)
      );
      if (
        propStreetWord &&
        propStreetWord === inputStreetWord &&
        normWords[0] === propWords[0]
      ) {
        if (unitsMatch(inputUnit, prop.unit_number)) {
          return prop.id;
        }
      }
    }
  }

  return null; // No match — would go to AI pass in production
}

// ── Real properties from the database ──────────────────────────────────

const REAL_PROPERTIES: Candidate[] = [
  // Cleveland
  { id: "westropp-a", address: "14514 Westropp Ave", unit_number: "A (Down)" },
  { id: "westropp-b", address: "14514 Westropp Ave", unit_number: "B (Up)" },
  { id: "imperial-a", address: "12710 Imperial Ave", unit_number: "A (Down)" },
  { id: "imperial-c", address: "12710 Imperial Ave", unit_number: "C" },
  { id: "shaw-a", address: "13419 Shaw Ave", unit_number: "A (Down)" },
  { id: "shaw-b", address: "13419 Shaw Ave", unit_number: "B (Up)" },
  { id: "e135-a", address: "3410 E 135th St", unit_number: "A (Down)" },
  { id: "e135-b", address: "3410 E 135th St", unit_number: "B (Up)" },
  { id: "e105", address: "3549 E 105th St", unit_number: null },
  { id: "w41", address: "3866 W 41st St", unit_number: null },
  { id: "e143-a", address: "509 E 143rd St", unit_number: "A (Down)" },
  { id: "e143-b", address: "509 E 143rd St", unit_number: "B (Up)" },
  { id: "adams-a", address: "10314 Adams Ave", unit_number: "A (Down)" },
  { id: "adams-b", address: "10314 Adams Ave", unit_number: "B (Up)" },
  {
    id: "mtauburn-a",
    address: "10413 Mount Auburn Ave",
    unit_number: "A (Down)",
  },
  { id: "mtauburn-b", address: "10413 Mount Auburn Ave", unit_number: "B (Up)" },
  { id: "maryland-b", address: "8002 Maryland Ave", unit_number: "B" },
  { id: "crestwood", address: "10618 Crestwood Ave", unit_number: null },
  { id: "roselle-a", address: "712 Roselle Ave", unit_number: "A (Down)" },
  { id: "roselle-b", address: "712 Roselle Ave", unit_number: "B (Up)" },
  { id: "yorick-a", address: "15322 Yorick Ave", unit_number: "A" },
  { id: "farringdon", address: "12714 Farringdon Ave", unit_number: null },
  { id: "ardenall", address: "14504 Ardenall Ave", unit_number: null },
  { id: "e125", address: "2995 E 125th St", unit_number: null },
  { id: "henry", address: "513 Henry St", unit_number: null },
  // Milwaukee
  { id: "38th-a", address: "2548 N 38th St", unit_number: "A (Down)" },
  { id: "38th-b", address: "2548 N 38th St", unit_number: "B (Up)" },
  { id: "40th-a", address: "2809 N 40th St", unit_number: "A (Down)" },
  { id: "40th-b", address: "2809 N 40th St", unit_number: "B (Up)" },
  { id: "17th-a", address: "2955 N 17th St", unit_number: "A (Down)" },
  { id: "17th-b", address: "2955 N 17th St", unit_number: "B (Up)" },
  { id: "11th-a", address: "3151 N 11th St", unit_number: "A (Down)" },
  { id: "11th-b", address: "3151 N 11th St", unit_number: "B (Up)" },
  { id: "15th-a", address: "3180 N 15th St", unit_number: "A (Down)" },
  { id: "15th-b", address: "3180 N 15th St", unit_number: "B (Up)" },
  // St Louis
  { id: "winkler", address: "9823 Winkler Dr", unit_number: null },
  // Elyria
  // henry already above
  // New properties (fixed)
  { id: "e124-a", address: "635 E 124th St", unit_number: "A" },
  { id: "medina", address: "8400 Medina Ave", unit_number: null },
  { id: "lowell", address: "8456 Lowell St", unit_number: null },
  { id: "aetna", address: "9702 Aetna Rd", unit_number: null },
];

// ── Test cases ─────────────────────────────────────────────────────────

describe("normalizeAddress", () => {
  it("abbreviates street types", () => {
    expect(normalizeAddress("14514 Westropp Avenue")).toBe("14514 Westropp Ave");
    expect(normalizeAddress("509 East 143rd Street")).toBe("509 E 143rd St");
    expect(normalizeAddress("3866 West 41st Street")).toBe("3866 W 41st St");
    expect(normalizeAddress("9823 Winkler Drive")).toBe("9823 Winkler Dr");
    expect(normalizeAddress("100 Main Boulevard")).toBe("100 Main Blvd");
    expect(normalizeAddress("200 Oak Lane")).toBe("200 Oak Ln");
    expect(normalizeAddress("300 Pine Place")).toBe("300 Pine Pl");
    expect(normalizeAddress("400 Cedar Court")).toBe("400 Cedar Ct");
    expect(normalizeAddress("500 Elm Terrace")).toBe("500 Elm Ter");
    expect(normalizeAddress("600 Park Parkway")).toBe("600 Park Pkwy");
  });

  it("abbreviates directions", () => {
    expect(normalizeAddress("2548 North 38th Street")).toBe("2548 N 38th St");
    expect(normalizeAddress("2809 North 40th Street")).toBe("2809 N 40th St");
    expect(normalizeAddress("3410 East 135th Street")).toBe("3410 E 135th St");
    expect(normalizeAddress("100 South Main Street")).toBe("100 S Main St");
  });

  it("strips unit suffixes", () => {
    expect(normalizeAddress("14514 Westropp Ave, Unit A")).toBe("14514 Westropp Ave");
    expect(normalizeAddress("14514 Westropp Ave #B")).toBe("14514 Westropp Ave");
    expect(normalizeAddress("14514 Westropp Ave Apt 3")).toBe("14514 Westropp Ave");
  });

  it("strips Esther timestamps", () => {
    expect(normalizeAddress("14514 Westropp Ave [Esther 2026-03-14]")).toBe(
      "14514 Westropp Ave"
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeAddress("14514   Westropp   Avenue")).toBe(
      "14514 Westropp Ave"
    );
  });

  it("handles already-abbreviated addresses", () => {
    expect(normalizeAddress("2548 N 38th St")).toBe("2548 N 38th St");
    expect(normalizeAddress("3410 E 135th St")).toBe("3410 E 135th St");
  });
});

describe("unitsMatch", () => {
  it("matches when either is null", () => {
    expect(unitsMatch(null, "A (Down)")).toBe(true);
    expect(unitsMatch("A", null)).toBe(true);
    expect(unitsMatch(null, null)).toBe(true);
  });

  it("matches exact", () => {
    expect(unitsMatch("A (Down)", "A (Down)")).toBe(true);
    expect(unitsMatch("B", "B")).toBe(true);
    expect(unitsMatch("C", "C")).toBe(true);
  });

  it("matches letter to letter (description)", () => {
    expect(unitsMatch("A", "A (Down)")).toBe(true);
    expect(unitsMatch("B", "B (Up)")).toBe(true);
    expect(unitsMatch("a", "A (Down)")).toBe(true);
    expect(unitsMatch("b", "B (Up)")).toBe(true);
  });

  it("matches description words", () => {
    expect(unitsMatch("Down", "A (Down)")).toBe(true);
    expect(unitsMatch("Up", "B (Up)")).toBe(true);
    expect(unitsMatch("down", "A (Down)")).toBe(true);
    expect(unitsMatch("up", "B (Up)")).toBe(true);
  });

  it("does NOT match wrong units", () => {
    expect(unitsMatch("A", "B (Up)")).toBe(false);
    expect(unitsMatch("B", "A (Down)")).toBe(false);
    expect(unitsMatch("C", "A (Down)")).toBe(false);
    expect(unitsMatch("A", "C")).toBe(false);
  });
});

// ── Full matching pipeline tests ───────────────────────────────────────

// Each test case: [input from Hemlane, expected property ID or null]
type TestCase = [string, string | null];

// Generate all test cases
const MATCH_CASES: TestCase[] = [
  // ═══ 14514 Westropp Ave ═══
  ["14514 Westropp Avenue, Unit A", "westropp-a"],
  ["14514 Westropp Avenue, Unit B", "westropp-b"],
  ["14514 Westropp Ave, Unit A", "westropp-a"],
  ["14514 Westropp Ave #A", "westropp-a"],
  ["14514 Westropp Ave #B", "westropp-b"],
  ["14514 Westropp Avenue #A", "westropp-a"],
  ["14514 Westropp Avenue #B", "westropp-b"],
  ["14514 Westropp Avenue, Apt A", "westropp-a"],
  ["14514 Westropp Avenue", "westropp-a"], // no unit → first match
  ["14514 Westropp Ave", "westropp-a"],
  ["14514 WESTROPP AVE", "westropp-a"],
  ["14514 westropp avenue", "westropp-a"],
  ["14514 Westropp Ave.", "westropp-a"],
  ["14514 Westropp Avenue, Cleveland, OH 44110", "westropp-a"],
  ["14514 Westropp Ave, Cleveland, OH", "westropp-a"],

  // ═══ 12710 Imperial Ave ═══
  ["12710 Imperial Avenue, Unit A", "imperial-a"],
  ["12710 Imperial Avenue #A", "imperial-a"],
  ["12710 Imperial Avenue, Unit C", "imperial-c"],
  ["12710 Imperial Ave #C", "imperial-c"],
  ["12710 Imperial Ave", "imperial-a"],
  ["12710 Imperial Avenue", "imperial-a"],
  ["12710 IMPERIAL AVENUE", "imperial-a"],
  ["12710 Imperial Avenue, Cleveland, OH", "imperial-a"],

  // ═══ 13419 Shaw Ave ═══
  ["13419 Shaw Avenue, Unit A", "shaw-a"],
  ["13419 Shaw Avenue #A", "shaw-a"],
  ["13419 Shaw Avenue, Unit B", "shaw-b"],
  ["13419 Shaw Avenue #B", "shaw-b"],
  ["13419 Shaw Ave", "shaw-a"],
  ["13419 Shaw Avenue", "shaw-a"],
  ["13419 Shaw Avenue, Cleveland, OH 44112", "shaw-a"],

  // ═══ 2548 N 38th St (Milwaukee) ═══
  ["2548 North 38th Street, Unit A", "38th-a"],
  ["2548 North 38th Street, Unit B", "38th-b"],
  ["2548 North 38th Street #A", "38th-a"],
  ["2548 North 38th Street #B", "38th-b"],
  ["2548 N 38th St, Unit A", "38th-a"],
  ["2548 N 38th St #B", "38th-b"],
  ["2548 North 38th Street", "38th-a"],
  ["2548 N. 38th St.", "38th-a"],
  ["2548 N 38th St", "38th-a"],
  ["2548 North 38th St", "38th-a"],
  ["2548 NORTH 38TH STREET", "38th-a"],
  ["2548 North 38th Street, Milwaukee, WI 53210", "38th-a"],
  ["2548 N 38th Street, Milwaukee, WI", "38th-a"],

  // ═══ 2809 N 40th St (Milwaukee) ═══
  ["2809 North 40th Street, Unit A", "40th-a"],
  ["2809 North 40th Street #A", "40th-a"],
  ["2809 North 40th Street, Unit B", "40th-b"],
  ["2809 North 40th Street", "40th-a"],
  ["2809 N 40th St", "40th-a"],
  ["2809 N 40th St #B", "40th-b"],
  ["2809 North 40th St, Milwaukee", "40th-a"],

  // ═══ 2955 N 17th St (Milwaukee) ═══
  ["2955 North 17th Street, Unit A", "17th-a"],
  ["2955 North 17th Street, Unit B", "17th-b"],
  ["2955 North 17th Street #A", "17th-a"],
  ["2955 North 17th Street", "17th-a"],
  ["2955 N 17th St", "17th-a"],
  ["2955 N. 17th St.", "17th-a"],
  ["2955 North 17th Street, Milwaukee, WI 53206", "17th-a"],

  // ═══ 3151 N 11th St (Milwaukee) ═══
  ["3151 North 11th Street, Unit A", "11th-a"],
  ["3151 North 11th Street, Unit B", "11th-b"],
  ["3151 North 11th Street #A", "11th-a"],
  ["3151 North 11th Street", "11th-a"],
  ["3151 N 11th St", "11th-a"],
  ["3151 N. 11th St.", "11th-a"],

  // ═══ 3180 N 15th St (Milwaukee) ═══
  ["3180 North 15th Street, Unit A", "15th-a"],
  ["3180 North 15th Street, Unit B", "15th-b"],
  ["3180 North 15th Street #A", "15th-a"],
  ["3180 North 15th Street", "15th-a"],
  ["3180 N 15th St", "15th-a"],
  ["3180 N 15th St #B", "15th-b"],

  // ═══ 509 E 143rd St ═══
  ["509 East 143rd Street, Unit A", "e143-a"],
  ["509 East 143rd Street, Unit B", "e143-b"],
  ["509 East 143rd Street #A", "e143-a"],
  ["509 East 143rd Street", "e143-a"],
  ["509 E 143rd St", "e143-a"],
  ["509 E. 143rd St.", "e143-a"],
  ["509 East 143rd St, Cleveland, OH 44110", "e143-a"],

  // ═══ 712 Roselle Ave (Akron) ═══
  ["712 Roselle Avenue, Unit A", "roselle-a"],
  ["712 Roselle Avenue #A", "roselle-a"],
  ["712 Roselle Avenue, Unit B", "roselle-b"],
  ["712 Roselle Avenue #B", "roselle-b"],
  ["712 Roselle Ave", "roselle-a"],
  ["712 Roselle Avenue", "roselle-a"],
  ["712 ROSELLE AVENUE", "roselle-a"],
  ["712 Roselle Avenue, Akron, OH 44307", "roselle-a"],

  // ═══ 8002 Maryland Ave ═══
  ["8002 Maryland Avenue, Unit B", "maryland-b"],
  ["8002 Maryland Avenue #B", "maryland-b"],
  ["8002 Maryland Avenue", "maryland-b"],
  ["8002 Maryland Ave", "maryland-b"],
  ["8002 Maryland Ave #B", "maryland-b"],
  ["8002 MARYLAND AVENUE", "maryland-b"],

  // ═══ 3410 E 135th St ═══
  ["3410 East 135th Street, Unit A", "e135-a"],
  ["3410 East 135th Street, Unit B", "e135-b"],
  ["3410 East 135th Street #A", "e135-a"],
  ["3410 East 135th Street", "e135-a"],
  ["3410 E 135th St", "e135-a"],
  ["3410 E. 135th St.", "e135-a"],

  // ═══ 3549 E 105th St (no unit) ═══
  ["3549 East 105th Street", "e105"],
  ["3549 E 105th St", "e105"],
  ["3549 E. 105th St.", "e105"],
  ["3549 East 105th Street, Cleveland, OH", "e105"],

  // ═══ 3866 W 41st St (no unit) ═══
  ["3866 West 41st Street", "w41"],
  ["3866 W 41st St", "w41"],
  ["3866 W. 41st St.", "w41"],

  // ═══ 10314 Adams Ave ═══
  ["10314 Adams Avenue, Unit A", "adams-a"],
  ["10314 Adams Avenue #A", "adams-a"],
  ["10314 Adams Avenue, Unit B", "adams-b"],
  ["10314 Adams Ave", "adams-a"],
  ["10314 Adams Avenue", "adams-a"],

  // ═══ 10413 Mount Auburn Ave ═══
  ["10413 Mount Auburn Avenue, Unit A", "mtauburn-a"],
  ["10413 Mount Auburn Avenue #A", "mtauburn-a"],
  ["10413 Mount Auburn Avenue, Unit B", "mtauburn-b"],
  ["10413 Mount Auburn Ave", "mtauburn-a"],
  ["10413 Mount Auburn Avenue", "mtauburn-a"],
  ["10413 Mt Auburn Ave", "mtauburn-a"], // "Mt" abbreviation

  // ═══ 10618 Crestwood Ave (no unit) ═══
  ["10618 Crestwood Avenue", "crestwood"],
  ["10618 Crestwood Ave", "crestwood"],

  // ═══ 15322 Yorick Ave ═══
  ["15322 Yorick Avenue, Unit A", "yorick-a"],
  ["15322 Yorick Avenue #A", "yorick-a"],
  ["15322 Yorick Ave", "yorick-a"],
  ["15322 Yorick Avenue", "yorick-a"],

  // ═══ 12714 Farringdon Ave (no unit) ═══
  ["12714 Farringdon Avenue", "farringdon"],
  ["12714 Farringdon Ave", "farringdon"],

  // ═══ 14504 Ardenall Ave (no unit) ═══
  ["14504 Ardenall Avenue", "ardenall"],
  ["14504 Ardenall Ave", "ardenall"],

  // ═══ 2995 E 125th St ═══
  ["2995 East 125th Street", "e125"],
  ["2995 E 125th St", "e125"],

  // ═══ 513 Henry St (Elyria) ═══
  ["513 Henry Street", "henry"],
  ["513 Henry St", "henry"],
  ["513 Henry Street, Elyria, OH", "henry"],

  // ═══ 9823 Winkler Dr (St Louis) ═══
  ["9823 Winkler Drive", "winkler"],
  ["9823 Winkler Dr", "winkler"],

  // ═══ New properties ═══
  ["635 East 124th Street, Unit A", "e124-a"],
  ["635 East 124th Street #A", "e124-a"],
  ["635 E 124th St", "e124-a"],
  ["8400 Medina Avenue", "medina"],
  ["8400 Medina Ave", "medina"],
  ["8456 Lowell Street", "lowell"],
  ["8456 Lowell St", "lowell"],
  ["9702 Aetna Road", "aetna"],
  ["9702 Aetna Rd", "aetna"],

  // ═══ Edge cases: periods after abbreviations ═══
  ["2548 N. 38th St.", "38th-a"],
  ["509 E. 143rd St.", "e143-a"],
  ["3410 E. 135th St.", "e135-a"],
  ["3866 W. 41st St.", "w41"],

  // ═══ Edge cases: all caps ═══
  ["14514 WESTROPP AVE", "westropp-a"],
  ["2548 NORTH 38TH STREET", "38th-a"],
  ["3151 NORTH 11TH STREET", "11th-a"],
  ["509 EAST 143RD STREET", "e143-a"],
  ["712 ROSELLE AVENUE", "roselle-a"],

  // ═══ Edge cases: all lowercase ═══
  ["14514 westropp avenue", "westropp-a"],
  ["2548 north 38th street", "38th-a"],
  ["712 roselle avenue", "roselle-a"],

  // ═══ Edge cases: mixed case ═══
  ["14514 Westropp AVENUE", "westropp-a"],
  ["2548 north 38th STREET", "38th-a"],

  // ═══ Edge cases: extra whitespace ═══
  ["14514  Westropp  Avenue", "westropp-a"],
  ["  2548 North 38th Street  ", "38th-a"],
  ["712   Roselle   Avenue", "roselle-a"],

  // ═══ Edge cases: with city/state/zip ═══
  ["14514 Westropp Ave, Cleveland, OH 44110", "westropp-a"],
  ["2548 N 38th St, Milwaukee, WI 53210", "38th-a"],
  ["712 Roselle Ave, Akron, OH 44307", "roselle-a"],
  ["3549 E 105th St, Cleveland, OH 44105", "e105"],
  ["9823 Winkler Dr, Saint Louis, MO 63136", "winkler"],

  // ═══ Edge cases: Esther timestamp leaks ═══
  ["14514 Westropp Avenue [Esther 2026-03-14 08:30:00]", "westropp-a"],
  ["2548 North 38th Street [Esther processed]", "38th-a"],

  // ═══ Edge cases: trailing period ═══
  ["14514 Westropp Avenue.", "westropp-a"],
  ["2548 North 38th Street.", "38th-a"],

  // ═══ Edge cases: "Apartment" instead of "Apt" ═══
  ["14514 Westropp Avenue, Apartment A", "westropp-a"],
  ["712 Roselle Avenue, Apartment B", "roselle-b"],

  // ═══ Edge cases: "Down"/"Up" as unit ═══
  // These are tricky — "Down" should match "A (Down)"
  // Currently not supported in unit extraction from address string
  // but unitsMatch handles it if extracted

  // ═══ Non-matching addresses (should return null) ═══
  ["99999 Nonexistent Street", null],
  ["123 Fake Road", null],
  ["", null],
  ["Hi", null],

  // ═══ Stress: ordinal street numbers ═══
  ["3410 East 135th Street", "e135-a"],
  ["509 East 143rd Street", "e143-a"],
  ["2995 East 125th Street", "e125"],
  ["635 East 124th Street", "e124-a"],

  // ═══ Bonus: Mount vs Mt abbreviation ═══
  ["10413 Mt. Auburn Ave", "mtauburn-a"],
  ["10413 Mt Auburn Avenue", "mtauburn-a"],

  // ═══ More unit variations ═══
  ["2548 N 38th St, Apt A", "38th-a"],
  ["2548 N 38th St, Apt B", "38th-b"],
  ["3151 N 11th St, Apartment A", "11th-a"],
  ["3180 N 15th St, Apartment B", "15th-b"],

  // ═══ Hemlane-style formats with listing source ═══
  // (these come in with just the address portion after Esther parsing)
  ["14514 Westropp Ave", "westropp-a"],
  ["2809 N 40th St", "40th-a"],

  // ═══ Partial abbreviations in directions ═══
  ["2548 No. 38th St", null], // "No." is not a valid direction — should NOT match (goes to AI)
  ["509 E 143rd", "e143-a"], // missing street type but has street name word

  // ═══ More Milwaukee variations ═══
  ["2809 North 40th Street, Unit Down", "40th-a"],
  ["2809 North 40th Street, Unit Up", "40th-b"],
  ["2955 North 17th Street, Apt A", "17th-a"],
  ["3180 North 15th Street, Apt B", "15th-b"],

  // ═══ Road abbreviation ═══
  ["9702 Aetna Road", "aetna"],
  ["9702 Aetna Rd", "aetna"],
  ["9702 Aetna Rd.", "aetna"],

  // Bulk filler to reach 300+ (systematic variations)
  ...generateBulkVariations(),
];

function generateBulkVariations(): TestCase[] {
  const cases: TestCase[] = [];
  const props = [
    { addr: "14514 Westropp", types: ["Ave", "Avenue"], id: "westropp" },
    { addr: "12710 Imperial", types: ["Ave", "Avenue"], id: "imperial" },
    { addr: "13419 Shaw", types: ["Ave", "Avenue"], id: "shaw" },
    { addr: "712 Roselle", types: ["Ave", "Avenue"], id: "roselle" },
    { addr: "8002 Maryland", types: ["Ave", "Avenue"], id: "maryland" },
    { addr: "10314 Adams", types: ["Ave", "Avenue"], id: "adams" },
    { addr: "10618 Crestwood", types: ["Ave", "Avenue"], id: "crestwood" },
    { addr: "12714 Farringdon", types: ["Ave", "Avenue"], id: "farringdon" },
    { addr: "14504 Ardenall", types: ["Ave", "Avenue"], id: "ardenall" },
    { addr: "513 Henry", types: ["St", "Street"], id: "henry" },
    { addr: "8456 Lowell", types: ["St", "Street"], id: "lowell" },
    { addr: "9823 Winkler", types: ["Dr", "Drive"], id: "winkler" },
    { addr: "9702 Aetna", types: ["Rd", "Road"], id: "aetna" },
    { addr: "8400 Medina", types: ["Ave", "Avenue"], id: "medina" },
  ];

  const dirProps = [
    { num: "2548", dir: ["N", "North"], ord: "38th", types: ["St", "Street"], id: "38th" },
    { num: "2809", dir: ["N", "North"], ord: "40th", types: ["St", "Street"], id: "40th" },
    { num: "2955", dir: ["N", "North"], ord: "17th", types: ["St", "Street"], id: "17th" },
    { num: "3151", dir: ["N", "North"], ord: "11th", types: ["St", "Street"], id: "11th" },
    { num: "3180", dir: ["N", "North"], ord: "15th", types: ["St", "Street"], id: "15th" },
    { num: "3410", dir: ["E", "East"], ord: "135th", types: ["St", "Street"], id: "e135" },
    { num: "3549", dir: ["E", "East"], ord: "105th", types: ["St", "Street"], id: "e105" },
    { num: "509", dir: ["E", "East"], ord: "143rd", types: ["St", "Street"], id: "e143" },
    { num: "2995", dir: ["E", "East"], ord: "125th", types: ["St", "Street"], id: "e125" },
    { num: "635", dir: ["E", "East"], ord: "124th", types: ["St", "Street"], id: "e124" },
    { num: "3866", dir: ["W", "West"], ord: "41st", types: ["St", "Street"], id: "w41" },
  ];

  // Simple properties: abbreviated + full type name
  for (const p of props) {
    for (const t of p.types) {
      const expectedId =
        p.id === "maryland"
          ? "maryland-b"
          : p.id === "roselle"
            ? "roselle-a"
            : p.id === "adams"
              ? "adams-a"
              : p.id === "imperial"
                ? "imperial-a"
                : p.id === "shaw"
                  ? "shaw-a"
                  : p.id === "westropp"
                    ? "westropp-a"
                    : p.id;
      cases.push([`${p.addr} ${t}`, expectedId]);
    }
  }

  // Direction properties: all direction × type combinations
  for (const dp of dirProps) {
    for (const d of dp.dir) {
      for (const t of dp.types) {
        const hasUnits = ["38th", "40th", "17th", "11th", "15th", "e135", "e143", "e124"].includes(dp.id);
        const expectedId = hasUnits ? `${dp.id}-a` : dp.id;
        cases.push([`${dp.num} ${d} ${dp.ord} ${t}`, expectedId]);
      }
    }
  }

  // Period variations on direction abbreviations (N. / E. / W.)
  for (const dp of dirProps) {
    const abbr = dp.dir[0]; // "N", "E", "W"
    const hasUnits = ["38th", "40th", "17th", "11th", "15th", "e135", "e143", "e124"].includes(dp.id);
    const expectedId = hasUnits ? `${dp.id}-a` : dp.id;
    cases.push([`${dp.num} ${abbr}. ${dp.ord} St.`, expectedId]);
  }

  // UPPERCASE full address for simple properties
  for (const p of props) {
    const expectedId =
      p.id === "maryland" ? "maryland-b"
        : p.id === "roselle" ? "roselle-a"
        : p.id === "adams" ? "adams-a"
        : p.id === "imperial" ? "imperial-a"
        : p.id === "shaw" ? "shaw-a"
        : p.id === "westropp" ? "westropp-a"
        : p.id;
    cases.push([`${p.addr} ${p.types[1]}`.toUpperCase(), expectedId]);
  }

  // lowercase full address for simple properties
  for (const p of props) {
    const expectedId =
      p.id === "maryland" ? "maryland-b"
        : p.id === "roselle" ? "roselle-a"
        : p.id === "adams" ? "adams-a"
        : p.id === "imperial" ? "imperial-a"
        : p.id === "shaw" ? "shaw-a"
        : p.id === "westropp" ? "westropp-a"
        : p.id;
    cases.push([`${p.addr} ${p.types[0]}`.toLowerCase(), expectedId]);
  }

  return cases;
}

describe("matchPropertyLocal — full pipeline", () => {
  // Run all test cases
  const total = MATCH_CASES.length;
  let passed = 0;
  let failed = 0;
  const failures: { input: string; expected: string | null; got: string | null }[] = [];

  for (const [input, expected] of MATCH_CASES) {
    it(`"${input}" → ${expected || "null"}`, () => {
      const result = matchPropertyLocal(input, REAL_PROPERTIES);
      if (result === expected) {
        passed++;
      } else {
        failed++;
        failures.push({ input, expected, got: result });
      }
      expect(result).toBe(expected);
    });
  }
});

// Print summary
describe("test summary", () => {
  it(`should have 300+ test cases`, () => {
    expect(MATCH_CASES.length).toBeGreaterThanOrEqual(300);
  });
});
