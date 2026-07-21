import React, { useEffect, useRef, useState } from "react";
import { Phone, ArrowRight } from "lucide-react";

/**
 * Section 8, stress free — a landlord-facing landing page.
 *
 * The page makes one argument, and the layout IS the argument: a Section 8
 * placement is a 13-step bureaucratic chain, and the landlord touches two of
 * them. Every row carries a stamp saying who owns it, so the indigo/gold
 * imbalance does the selling before a word of copy is read.
 *
 * Monospace is used for step numbers, stamps and the program acronyms (RFTA /
 * HQS / HAP) because it is the vernacular of the paperwork this page is
 * promising to absorb — not for decoration.
 */

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_HREF = "tel:+14404444737";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Who owns a step. The scarcity of "you" is the whole point. */
type Owner = "us" | "you" | "authority" | "tenant";

const OWNER_META: Record<Owner, { label: string; bg: string; fg: string; border: string }> = {
  us:        { label: "WE DO IT",         bg: "#EEF2FF", fg: "#4F46E5", border: "#C7D2FE" },
  you:       { label: "YOU",              bg: "#FFF6E6", fg: "#8A5A00", border: "#FFB22C" },
  authority: { label: "HOUSING AUTHORITY",bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0" },
  tenant:    { label: "TENANT",           bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0" },
};

const STEPS: { title: string; note?: string; owner: Owner }[] = [
  { title: "Sign the leasing permit", note: "Two minutes. It is what lets us act for you.", owner: "you" },
  { title: "Your property goes up on our platform", owner: "us" },
  { title: "Inquiries get screened", owner: "us" },
  { title: "Showings get scheduled", owner: "us" },
  { title: "Someone walks the property", note: "We run the showing in person.", owner: "us" },
  { title: "Tenant submits the RFTA", owner: "tenant" },
  { title: "RFTA goes to the housing authority", owner: "us" },
  { title: "The offer comes back", owner: "authority" },
  { title: "HQS inspection gets scheduled", owner: "us" },
  { title: "Inspection is attended, report goes to you", note: "Or you attend it yourself — your call.", owner: "us" },
  { title: "Repairs, if the inspection asks for any", note: "Free estimate first. Nothing starts without your yes.", owner: "us" },
  { title: "Sign the lease and the HAP contract", owner: "you" },
  { title: "Rent starts landing", note: "Direct deposit, on the first, every month.", owner: "authority" },
];

const SERVICES: {
  eyebrow: string;
  price: string;
  priceNote: string;
  title: string;
  body: string;
  points: string[];
}[] = [
  {
    eyebrow: "FIND ME A TENANT",
    price: "First month's rent",
    priceNote: "Charged once the tenant is placed. No placement, no invoice.",
    title: "We fill the unit",
    body: "We list it, field the inquiries, run the showings and carry the paperwork through to a signed HAP contract.",
    points: [
      "You sign a leasing permit to start — nothing else up front",
      "If the placement never happens, you pay nothing",
      "Showings are run in person, not left to a lockbox",
    ],
  },
  {
    eyebrow: "I ALREADY HAVE A TENANT",
    price: "$100",
    priceNote: "Per inspection attended, report included.",
    title: "We push your paperwork through",
    body: "You found the tenant. We know the process — the RFTA, the offer, the inspection scheduling, the follow-up when the authority goes quiet.",
    points: [
      "RFTA filed and tracked to an answer",
      "We attend the HQS inspection and hand you the report",
      "Prefer to attend yourself? Do it — you only pay if we go",
    ],
  },
  {
    eyebrow: "MANAGE IT FOR ME",
    price: "5%",
    priceNote: "Of monthly rent, only while the unit is rented.",
    title: "We run it month to month",
    body: "Tenant calls, payments and work orders stop reaching you and start reaching us.",
    points: [
      "We talk to the tenant so you don't have to",
      "Payments collected, or routed straight to your account",
      "Work orders taken, estimates back to you inside 24 hours",
    ],
  },
];

/** Reveals children once, on scroll. No-ops when the visitor prefers less motion. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { rootMargin: "-40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function CallButton({ variant = "solid" }: { variant?: "solid" | "ghost" }) {
  const solid = variant === "solid";
  return (
    <a
      href={PHONE_HREF}
      className="inline-flex items-center gap-3 rounded-full px-7 py-4 text-base font-bold transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={
        solid
          ? { background: "#4F46E5", color: "#fff", boxShadow: "0 10px 30px -10px rgba(79,70,229,0.7)", outlineColor: "#1E1B4B" }
          : { background: "#FFB22C", color: "#1E1B4B", boxShadow: "0 10px 30px -12px rgba(255,178,44,0.8)", outlineColor: "#fff" }
      }
    >
      <Phone className="h-5 w-5" strokeWidth={2.5} />
      <span>Call {PHONE_DISPLAY}</span>
      <ArrowRight className="h-4 w-4 opacity-70" strokeWidth={2.5} />
    </a>
  );
}

const Section8StressFree: React.FC = () => {
  const spine = useReveal<HTMLOListElement>();
  const youCount = STEPS.filter((s) => s.owner === "you").length;

  useEffect(() => {
    const prev = document.title;
    document.title = "Section 8, stress free — Rent Finder Cleveland";
    return () => { document.title = prev; };
  }, []);

  return (
    <main style={{ background: "#F4F5FB", color: "#1E1B4B" }} className="min-h-screen overflow-x-hidden">
      {/* ── Hero: the objection, named out loud ─────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: "#1E1B4B" }}>
        {/* Faint ledger rules — the paperwork, present but quiet. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, #fff 0 1px, transparent 1px 34px)" }}
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p style={{ fontFamily: MONO, color: "#FFB22C" }} className="text-xs tracking-[0.25em] mb-6">
            CLEVELAND · HOUSING CHOICE VOUCHER
          </p>
          <h1
            className="text-white font-extrabold leading-[0.98] text-[2.6rem] sm:text-6xl lg:text-7xl"
            style={{ letterSpacing: "-0.035em" }}
          >
            Section 8 pays<br />
            <span style={{ color: "#FFB22C" }}>on time, every time.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg sm:text-xl leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
            The paperwork is why you haven't done it. So we do the paperwork —
            all of it — and you sign {youCount === 2 ? "twice" : `${youCount} times`}.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <CallButton variant="ghost" />
            <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.45)" }} className="text-xs">
              No placement, no fee.
            </span>
          </div>
        </div>
      </section>

      {/* ── Signature: the labor split ──────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="mb-12 max-w-2xl">
          <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="text-xs tracking-[0.25em] mb-4">
            WHO DOES WHAT
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
            Thirteen steps stand between an empty unit and a rent check.
          </h2>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "#4B5170" }}>
            Here is every one of them, and who carries it. Count the gold rows —
            that is your entire job.
          </p>
        </div>

        <ol ref={spine.ref} className="relative">
          {/* The spine itself. */}
          <div aria-hidden className="absolute left-[22px] top-2 bottom-2 w-px" style={{ background: "#DDE1F0" }} />
          {STEPS.map((s, i) => {
            const m = OWNER_META[s.owner];
            const isYou = s.owner === "you";
            return (
              <li
                key={s.title}
                className="relative pl-14 sm:pl-16 mb-3 transition-all duration-500"
                style={{
                  opacity: spine.shown ? 1 : 0,
                  transform: spine.shown ? "none" : "translateY(10px)",
                  transitionDelay: `${Math.min(i * 45, 600)}ms`,
                }}
              >
                <span
                  className="absolute left-0 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold"
                  style={{
                    fontFamily: MONO,
                    background: isYou ? "#FFB22C" : "#fff",
                    color: isYou ? "#1E1B4B" : "#8A90AE",
                    border: `1px solid ${isYou ? "#FFB22C" : "#DDE1F0"}`,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className="flex flex-col gap-2 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  style={{
                    background: isYou ? "#FFFBF2" : "#fff",
                    border: `1px solid ${isYou ? "#FFB22C" : "#E7EAF6"}`,
                    boxShadow: isYou ? "0 6px 22px -14px rgba(255,178,44,0.9)" : "none",
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{s.title}</p>
                    {s.note && (
                      <p className="mt-1 text-sm leading-relaxed" style={{ color: "#6B7192" }}>
                        {s.note}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 self-start rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] sm:self-auto"
                    style={{ fontFamily: MONO, background: m.bg, color: m.fg, border: `1px solid ${m.border}` }}
                  >
                    {m.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Services + real prices ──────────────────────────────────────── */}
      <section style={{ background: "#fff", borderTop: "1px solid #E7EAF6", borderBottom: "1px solid #E7EAF6" }}>
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mb-14 max-w-2xl">
            <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="text-xs tracking-[0.25em] mb-4">
              PICK WHERE YOU NEED US
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
              Three ways in. You only pay when something actually happens.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {SERVICES.map((sv) => (
              <div
                key={sv.eyebrow}
                className="flex flex-col rounded-3xl p-7"
                style={{ background: "#F8F9FD", border: "1px solid #E7EAF6" }}
              >
                <p style={{ fontFamily: MONO, color: "#8A90AE" }} className="text-[10px] tracking-[0.2em]">
                  {sv.eyebrow}
                </p>
                <p className="mt-5 text-3xl font-extrabold leading-none" style={{ letterSpacing: "-0.03em", color: "#4F46E5" }}>
                  {sv.price}
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "#6B7192" }}>
                  {sv.priceNote}
                </p>
                <div className="my-6 h-px" style={{ background: "#E7EAF6" }} />
                <h3 className="text-xl font-bold leading-snug">{sv.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#4B5170" }}>
                  {sv.body}
                </p>
                <ul className="mt-6 space-y-3">
                  {sv.points.map((p) => (
                    <li key={p} className="flex gap-3 text-[15px] leading-relaxed">
                      <span aria-hidden style={{ color: "#FFB22C" }} className="mt-px font-bold">
                        —
                      </span>
                      <span style={{ color: "#3C4266" }}>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Repairs ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <div
          className="rounded-3xl px-7 py-10 sm:px-12 sm:py-12"
          style={{ background: "#fff", border: "1px solid #E7EAF6" }}
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="text-xs tracking-[0.25em] mb-4">
                IF THE INSPECTION FAILS
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
                A failed inspection is a delay, not a dead end.
              </h2>
              <p className="mt-4 text-lg leading-relaxed" style={{ color: "#4B5170" }}>
                Send us the report and the estimate comes back inside 24 hours,
                free, itemized. The work is done to the standard the inspector is
                going to hold you to — not the cheapest thing that passes.
              </p>
            </div>
            <div className="shrink-0">
              <p className="text-6xl font-extrabold leading-none" style={{ letterSpacing: "-0.04em", color: "#FFB22C" }}>
                24h
              </p>
              <p style={{ fontFamily: MONO, color: "#8A90AE" }} className="mt-3 text-[11px] tracking-[0.18em]">
                ESTIMATE, FREE
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Close ───────────────────────────────────────────────────────── */}
      <section style={{ background: "#1E1B4B" }} className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, #fff 0 1px, transparent 1px 34px)" }}
        />
        <div className="relative mx-auto max-w-4xl px-6 py-20 sm:py-24 text-center">
          <h2
            className="text-white text-3xl sm:text-5xl font-extrabold leading-tight"
            style={{ letterSpacing: "-0.03em" }}
          >
            Tell us about the unit.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            One call is enough to know which of the three you need — and what it
            would cost you. Usually the answer is nothing until it works.
          </p>
          <div className="mt-10 flex justify-center">
            <CallButton variant="ghost" />
          </div>
          <p style={{ fontFamily: MONO, color: "rgba(255,255,255,0.4)" }} className="mt-8 text-xs tracking-[0.15em]">
            RENT FINDER CLEVELAND
          </p>
        </div>
      </section>
    </main>
  );
};

export default Section8StressFree;
