import React from "react";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageSquare, Calendar, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    step: "1",
    icon: <Phone className="h-6 w-6" />,
    title: "Lead Calls In",
    desc: "Your AI agent answers 24/7, qualifies the prospect, and captures their needs",
  },
  {
    step: "2",
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Smart Nurturing",
    desc: "Automated follow-ups via call and SMS keep leads warm until they're ready",
  },
  {
    step: "3",
    icon: <Calendar className="h-6 w-6" />,
    title: "Showing Booked",
    desc: "AI schedules, confirms, and sends reminders automatically",
  },
  {
    step: "4",
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Lease Signed",
    desc: "Track the full journey from first call to signed lease in your dashboard",
  },
];

export const HowItWorksSection: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-32 overflow-hidden"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">
            How It Works
          </Badge>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold text-foreground"
          >
            From Lead to Lease in 4 Simple Steps
          </h2>
        </div>

        {/* ── DESKTOP PIPELINE (md+) ── */}
        <div className="hidden md:block" style={{ position: "relative", minHeight: 280 }}>

          {/* ── Pipeline track ── */}
          <div
            style={{
              position: "absolute",
              top: 42,
              left: "12.5%",
              right: "12.5%",
              height: 8,
              borderRadius: 4,
              background: "linear-gradient(90deg, #EF4444 0%, #F59E0B 35%, #ffb22c 55%, #22C55E 100%)",
              opacity: 0.18,
              zIndex: 1,
            }}
          />
          {/* Track glow layer */}
          <div
            style={{
              position: "absolute",
              top: 40,
              left: "12.5%",
              right: "12.5%",
              height: 12,
              borderRadius: 6,
              background: "linear-gradient(90deg, rgba(239,68,68,0.1), rgba(255,178,44,0.08), rgba(34,197,94,0.1))",
              filter: "blur(4px)",
              zIndex: 0,
            }}
          />
          {/* Particle container with overflow hidden */}
          <div
            style={{
              position: "absolute",
              top: 42,
              left: "12.5%",
              right: "12.5%",
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              zIndex: 2,
            }}
          >
            {[0].map((delay, idx) => (
              <div
                key={`particle-${idx}`}
                style={{
                  position: "absolute",
                  top: -6,
                  width: 50,
                  height: 20,
                  borderRadius: 10,
                  background: "radial-gradient(ellipse at center, currentColor 0%, transparent 70%)",
                  animation: `pipeFlow 4s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                }}
              >
                {/* Inner glow that shifts color via separate animation */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 10,
                    animation: `colorShift 4s ease-in-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* ── Step connector nodes on track ── */}
          {[
            { color: "#EF4444", glow: "rgba(239,68,68,0.4)" },
            { color: "#F59E0B", glow: "rgba(245,158,11,0.4)" },
            { color: "#ffb22c", glow: "rgba(255,178,44,0.4)" },
            { color: "#22C55E", glow: "rgba(34,197,94,0.4)" },
          ].map((node, i) => (
            <div
              key={`node-${i}`}
              style={{
                position: "absolute",
                top: 35,
                left: `calc(${12.5 + i * 25}% - 11px)`,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: node.color,
                border: "3px solid white",
                boxShadow: `0 2px 8px ${node.glow}`,
                zIndex: 5,
                animation: "nodePulse 3s ease-in-out infinite",
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}

          {/* ── Steps grid ── */}
          <div className="relative grid grid-cols-4 gap-6" style={{ zIndex: 10 }}>
            {STEPS.map((item, index) => (
              <div key={index} className="relative flex flex-col items-center text-center">
                {/* Icon */}
                <div className="relative inline-flex mb-6">
                  <div
                    className="flex items-center justify-center text-primary"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 16,
                      background: "white",
                      border: "1px solid rgba(55,13,75,0.08)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#ffb22c",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(255,178,44,0.4)",
                      border: "2px solid white",
                    }}
                  >
                    {item.step}
                  </span>
                </div>

                {/* Arrow between cards */}
                {index < 3 && (
                  <div
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -18,
                      zIndex: 15,
                      color: "#ffb22c",
                      animation: "arrowPush 2.5s ease-in-out infinite",
                      animationDelay: `${index * 0.3}s`,
                    }}
                  >
                    <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6 3l5 5-5 5V3z" />
                    </svg>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-foreground mb-1.5">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── MOBILE PIPELINE (< md) ── */}
        <div className="md:hidden relative">
          {/* Vertical pipeline track */}
          <div className="absolute left-6 top-4 bottom-4 w-[6px] z-0">
            <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(180deg, #EF4444 0%, #F59E0B 35%, #ffb22c 55%, #22C55E 100%)", opacity: 0.18 }} />
            <div className="pipeline-particle-v pipeline-particle-v-1" />
            <div className="pipeline-particle-v pipeline-particle-v-2" />
          </div>

          {/* Steps */}
          <div className="relative flex flex-col gap-10 z-[2]">
            {STEPS.map((item, index) => (
              <div key={index} className="flex items-start gap-5 pl-1">
                {/* Icon on the pipeline */}
                <div className="relative flex-shrink-0">
                  <div className="w-[52px] h-[52px] rounded-xl bg-white border border-primary/10 shadow-lg flex items-center justify-center text-primary">
                    {item.icon}
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#ffb22c] text-white text-[10px] font-bold flex items-center justify-center shadow ring-2 ring-white">
                    {item.step}
                  </span>
                </div>

                {/* Text */}
                <div className="pt-1">
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pipeFlow {
          0%   { left: 0; opacity: 0; }
          3%   { opacity: 1; }
          85%  { opacity: 1; }
          95%  { left: 100%; opacity: 0; }
          100% { left: 100%; opacity: 0; }
        }

        @keyframes colorShift {
          0%, 28%  { background: radial-gradient(ellipse at center, #EF4444 0%, rgba(239,68,68,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(239,68,68,0.6); }
          33%, 55% { background: radial-gradient(ellipse at center, #F59E0B 0%, rgba(245,158,11,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(245,158,11,0.6); }
          60%, 95% { background: radial-gradient(ellipse at center, #22C55E 0%, rgba(34,197,94,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(34,197,94,0.6); }
        }

        @keyframes nodePulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50%      { transform: scale(1.18); filter: brightness(1.2); }
        }

        @keyframes arrowPush {
          0%, 100% { opacity: 0.35; transform: translateX(0); }
          50%      { opacity: 1; transform: translateX(3px); }
        }

        /* ── Mobile vertical particles ── */
        .pipeline-particle-v {
          position: absolute;
          left: -3px;
          width: 12px;
          height: 32px;
          border-radius: 6px;
          animation: flowDown 3.5s linear infinite;
        }
        .pipeline-particle-v-1 { animation-delay: 0s; }
        .pipeline-particle-v-2 { animation-delay: -1.75s; }

        @keyframes flowDown {
          0%   { top: -32px; opacity: 0; background: linear-gradient(180deg, transparent, #EF4444, #EF4444, transparent); box-shadow: 0 0 10px rgba(239,68,68,0.5); }
          5%   { opacity: 0.85; }
          33%  { background: linear-gradient(180deg, transparent, #F59E0B, #F59E0B, transparent); box-shadow: 0 0 10px rgba(245,158,11,0.5); }
          66%  { background: linear-gradient(180deg, transparent, #ffb22c, #ffb22c, transparent); box-shadow: 0 0 10px rgba(255,178,44,0.5); }
          80%  { opacity: 0.85; background: linear-gradient(180deg, transparent, #22C55E, #22C55E, transparent); box-shadow: 0 0 10px rgba(34,197,94,0.5); }
          95%  { opacity: 0.2; }
          100% { top: calc(100% - 32px); opacity: 0; }
        }
      `}</style>
    </section>
  );
};

