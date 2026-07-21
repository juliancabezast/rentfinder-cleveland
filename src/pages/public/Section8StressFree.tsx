import React, { useEffect } from "react";
import { Phone, ArrowRight, Check } from "lucide-react";
import { SiteFooter } from "@/components/public/SiteFooter";

/**
 * Section 8, stress free — a landlord-facing landing page.
 *
 * The page makes one argument: a Section 8 placement is a 13-step bureaucratic
 * chain and the landlord touches two of them.
 *
 * Structure is punchline-first, on purpose. The first version listed all 13
 * steps and made the reader assemble the conclusion themselves, which is a lot
 * of work for a stranger who is deciding in five seconds whether to keep
 * reading. So now: the two things you do, then a bar showing the proportion at
 * a glance, then the full sequence chunked into four named phases. Thirteen
 * items is a wall; four phases is something you can hold in your head.
 *
 * Monospace carries the stamps and the program acronyms (RFTA / HQS / HAP)
 * because it is the vernacular of the paperwork this page absorbs.
 */

const PHONE_DISPLAY = "(440) 444-4737";
const PHONE_HREF = "tel:+14404444737";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Owner = "us" | "you" | "authority" | "tenant";

const OWNER_META: Record<Owner, { label: string; dot: string; bg: string; fg: string; border: string }> = {
  us:        { label: "WE DO IT",          dot: "#4F46E5", bg: "#EEF2FF", fg: "#4F46E5", border: "#C7D2FE" },
  you:       { label: "YOU",               dot: "#FFB22C", bg: "#FFF6E6", fg: "#8A5A00", border: "#FFB22C" },
  authority: { label: "HOUSING AUTHORITY", dot: "#94A3B8", bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0" },
  tenant:    { label: "TENANT",            dot: "#94A3B8", bg: "#F1F5F9", fg: "#64748B", border: "#E2E8F0" },
};

/** The two gold steps, pulled out so the answer arrives before the evidence. */
const YOUR_JOB = [
  { title: "Sign the leasing permit", time: "Two minutes", note: "It is what lets us act for you." },
  { title: "Sign the lease and the HAP contract", time: "Five minutes", note: "After this, the rent starts." },
];

const PHASES: { label: string; steps: { t: string; owner: Owner; note?: string }[] }[] = [
  {
    label: "Getting it rented",
    steps: [
      { t: "Sign the leasing permit", owner: "you" },
      { t: "Your property goes up on our platform", owner: "us" },
      { t: "Inquiries get screened", owner: "us" },
      { t: "Showings get scheduled", owner: "us" },
      { t: "Someone walks the property with them", owner: "us", note: "In person — not a lockbox." },
    ],
  },
  {
    label: "The application",
    steps: [
      { t: "Tenant submits the RFTA", owner: "tenant" },
      { t: "RFTA goes to the housing authority", owner: "us" },
      { t: "The offer comes back", owner: "authority" },
    ],
  },
  {
    label: "The inspection",
    steps: [
      { t: "HQS inspection gets scheduled", owner: "us" },
      { t: "We attend it and send you the report", owner: "us", note: "Or go yourself — your call." },
      { t: "Repairs, if the inspection asks for any", owner: "us", note: "Free estimate first. Nothing starts without your yes." },
    ],
  },
  {
    label: "Signed and paid",
    steps: [
      { t: "Sign the lease and the HAP contract", owner: "you" },
      { t: "Rent starts landing", owner: "authority", note: "Direct deposit, on the first, every month." },
    ],
  },
];

const ALL_STEPS = PHASES.flatMap((p) => p.steps);
const TALLY: { owner: Owner; n: number }[] = (["you", "us", "authority", "tenant"] as Owner[])
  .map((owner) => ({ owner, n: ALL_STEPS.filter((s) => s.owner === owner).length }))
  .filter((r) => r.n > 0);

const SERVICES: {
  eyebrow: string; price: string; priceNote: string; title: string; body: string; points: string[];
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

function CallButton({ variant = "gold", className = "" }: { variant?: "gold" | "indigo"; className?: string }) {
  const gold = variant === "gold";
  return (
    <a
      href={PHONE_HREF}
      className={`inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[15px] font-bold transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={
        gold
          ? { background: "#FFB22C", color: "#1E1B4B", boxShadow: "0 10px 30px -12px rgba(255,178,44,0.8)", outlineColor: "#fff" }
          : { background: "#4F46E5", color: "#fff", boxShadow: "0 10px 30px -10px rgba(79,70,229,0.7)", outlineColor: "#1E1B4B" }
      }
    >
      <Phone className="h-4 w-4" strokeWidth={2.5} />
      <span>Book a Meeting Now</span>
      <ArrowRight className="h-4 w-4 opacity-70" strokeWidth={2.5} />
    </a>
  );
}

const Section8StressFree: React.FC = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Section 8, stress free — Rent Finder Cleveland";
    return () => { document.title = prev; };
  }, []);

  return (
    <div style={{ background: "#F4F5FB", color: "#1E1B4B" }} className="min-h-screen overflow-x-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(30,27,75,0.92)", backdropFilter: "blur(14px)", borderColor: "rgba(255,255,255,0.1)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo-512.png" alt="Rent Finder Cleveland" className="h-9 w-9 rounded-lg" />
            <span className="hidden text-[15px] font-bold text-white sm:inline">Rent Finder Cleveland</span>
          </a>
          <a
            href={PHONE_HREF}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold transition-transform duration-200 hover:-translate-y-0.5 sm:px-5 sm:text-sm"
            style={{ background: "#FFB22C", color: "#1E1B4B" }}
          >
            <Phone className="h-4 w-4" strokeWidth={2.5} />
            <span>Book a Meeting Now</span>
          </a>
        </div>
      </header>

      <main>
        {/* ── Hero, over the marketplace video ──────────────────────────── */}
        <section className="relative overflow-hidden" style={{ background: "#1E1B4B" }}>
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/header-background.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          {/* Ink wash. Weighted to the left, where the words are: dark enough
              there for white type, thin enough on the right that the footage
              actually reads as footage. Matches the marketplace hero's 85/75. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(115deg, rgba(30,27,75,0.90) 0%, rgba(30,27,75,0.78) 52%, rgba(49,42,120,0.62) 100%)" }}
          />
          <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <p style={{ fontFamily: MONO, color: "#FFB22C" }} className="mb-6 text-xs tracking-[0.25em]">
              CLEVELAND · HOUSING CHOICE VOUCHER
            </p>
            <h1
              className="text-[2.6rem] font-extrabold leading-[0.98] text-white sm:text-6xl lg:text-7xl"
              style={{ letterSpacing: "-0.035em" }}
            >
              Section 8 pays<br />
              <span style={{ color: "#FFB22C" }}>on time, every time.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed sm:text-xl" style={{ color: "rgba(255,255,255,0.75)" }}>
              The paperwork is why you haven't done it. So we do the paperwork —
              all of it — and you sign twice.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <CallButton />
              <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.45)" }} className="text-xs">
                No placement, no fee.
              </span>
            </div>
          </div>
        </section>

        {/* ── The answer, before the evidence ───────────────────────────── */}
        <section className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
          <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="mb-4 text-xs tracking-[0.25em]">
            YOUR WHOLE JOB
          </p>
          <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            You sign two things. That is the entire ask.
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {YOUR_JOB.map((j, i) => (
              <div
                key={j.title}
                className="rounded-3xl p-7"
                style={{ background: "#FFFBF2", border: "2px solid #FFB22C", boxShadow: "0 12px 34px -22px rgba(255,178,44,1)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: "#FFB22C", color: "#1E1B4B" }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontFamily: MONO, color: "#8A5A00" }} className="text-[11px] tracking-[0.18em]">
                    {j.time.toUpperCase()}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-bold leading-snug">{j.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#6B7192" }}>
                  {j.note}
                </p>
              </div>
            ))}
          </div>

          {/* Proportion at a glance — one bar, thirteen segments, two gold. */}
          <div className="mt-12 rounded-3xl p-7" style={{ background: "#fff", border: "1px solid #E7EAF6" }}>
            <p className="text-[15px] font-semibold">
              A Section 8 placement takes {ALL_STEPS.length} steps. Here is who carries them.
            </p>
            <div className="mt-5 flex gap-1.5" role="img" aria-label={TALLY.map((t) => `${OWNER_META[t.owner].label}: ${t.n}`).join(", ")}>
              {ALL_STEPS.map((s, i) => (
                <span
                  key={i}
                  className="h-3 flex-1 rounded-full"
                  style={{ background: OWNER_META[s.owner].dot, opacity: s.owner === "you" ? 1 : 0.55 }}
                />
              ))}
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              {TALLY.map((t) => (
                <li key={t.owner} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: OWNER_META[t.owner].dot }} />
                  <span style={{ fontFamily: MONO }} className="text-[11px] tracking-[0.12em]" >
                    <span style={{ color: "#1E1B4B", fontWeight: 700 }}>{t.n}</span>{" "}
                    <span style={{ color: "#8A90AE" }}>{OWNER_META[t.owner].label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The evidence, chunked ─────────────────────────────────────── */}
        <section style={{ background: "#fff", borderTop: "1px solid #E7EAF6", borderBottom: "1px solid #E7EAF6" }}>
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="mb-4 text-xs tracking-[0.25em]">
              EVERYTHING ELSE, IN ORDER
            </p>
            <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Four stretches, start to first rent check.
            </h2>

            <div className="mt-10 space-y-4">
              {PHASES.map((phase, pi) => (
                <div key={phase.label} className="rounded-3xl p-6 sm:p-7" style={{ background: "#F8F9FD", border: "1px solid #E7EAF6" }}>
                  <div className="flex items-baseline gap-3">
                    <span style={{ fontFamily: MONO, color: "#8A90AE" }} className="text-xs">
                      {String(pi + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-lg font-bold">{phase.label}</h3>
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {phase.steps.map((s) => {
                      const m = OWNER_META[s.owner];
                      const isYou = s.owner === "you";
                      return (
                        <li
                          key={s.t}
                          className="flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5"
                          style={{
                            background: isYou ? "#FFFBF2" : "#fff",
                            border: `1px solid ${isYou ? "#FFB22C" : "#EDF0F8"}`,
                          }}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              aria-hidden
                              className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                              style={{ background: isYou ? "#FFB22C" : "#EEF2FF" }}
                            >
                              <Check className="h-2.5 w-2.5" strokeWidth={4} style={{ color: isYou ? "#1E1B4B" : "#4F46E5" }} />
                            </span>
                            <div className="min-w-0">
                              <p className={`leading-snug ${isYou ? "font-bold" : "font-medium"}`}>{s.t}</p>
                              {s.note && (
                                <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "#6B7192" }}>
                                  {s.note}
                                </p>
                              )}
                            </div>
                          </div>
                          <span
                            className="shrink-0 self-start rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] sm:self-auto"
                            style={{ fontFamily: MONO, background: m.bg, color: m.fg, border: `1px solid ${m.border}` }}
                          >
                            {m.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Services + real prices ────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="mb-12 max-w-2xl">
            <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="mb-4 text-xs tracking-[0.25em]">
              PICK WHERE YOU NEED US
            </p>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Three ways in. You only pay when something actually happens.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {SERVICES.map((sv) => (
              <div key={sv.eyebrow} className="flex flex-col rounded-3xl p-7" style={{ background: "#fff", border: "1px solid #E7EAF6" }}>
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
                      <span aria-hidden style={{ color: "#FFB22C" }} className="mt-px font-bold">—</span>
                      <span style={{ color: "#3C4266" }}>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Repairs ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-6 pb-20 sm:pb-24">
          <div className="rounded-3xl px-7 py-10 sm:px-12 sm:py-12" style={{ background: "#fff", border: "1px solid #E7EAF6" }}>
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <p style={{ fontFamily: MONO, color: "#4F46E5" }} className="mb-4 text-xs tracking-[0.25em]">
                  IF THE INSPECTION FAILS
                </p>
                <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl" style={{ letterSpacing: "-0.03em" }}>
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

        {/* ── Close ─────────────────────────────────────────────────────── */}
        <section style={{ background: "#1E1B4B" }} className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: "repeating-linear-gradient(to bottom, #fff 0 1px, transparent 1px 34px)" }}
          />
          <div className="relative mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
            <h2 className="text-3xl font-extrabold leading-tight text-white sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
              Tell us about the unit.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              One call is enough to know which of the three you need — and what it
              would cost you. Usually the answer is nothing until it works.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <CallButton />
              <a href={PHONE_HREF} className="text-lg font-bold" style={{ color: "#FFB22C" }}>
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Section8StressFree;
