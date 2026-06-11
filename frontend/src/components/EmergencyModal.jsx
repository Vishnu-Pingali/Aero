import { useStore } from "../store/AppStore";

const SQUAWK_CODES = [
  {
    code: "7700",
    label: "GENERAL EMERGENCY",
    color: "text-error",
    bg: "bg-error/10 border-error/30",
    desc: "General emergency — aircraft is in distress. ATC gives immediate priority. All nearby aircraft should listen on 121.5 MHz.",
  },
  {
    code: "7600",
    label: "RADIO FAILURE",
    color: "text-[#ffca7a]",
    bg: "bg-[#ffca7a]/10 border-[#ffca7a]/30",
    desc: "Loss of communication (NORDO). Aircraft continues flight plan if VMC, or holds and requests IFR clearance. ATC broadcasts on all frequencies.",
  },
  {
    code: "7500",
    label: "HIJACK",
    color: "text-secondary",
    bg: "bg-secondary/10 border-secondary/30",
    desc: "Unlawful interference (hijack). ATC alerts security services immediately. Aircraft continues normal profile to avoid suspicion.",
  },
  {
    code: "7777",
    label: "MILITARY INTERCEPT",
    color: "text-on-surface-variant",
    bg: "bg-on-surface/5 border-on-surface/10",
    desc: "Reserved for military intercept operations. Not to be squawked by civilian aircraft.",
  },
];

export default function EmergencyModal() {
  const { state, dispatch } = useStore();
  if (!state.showEmergencyModal) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] bg-background/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: "TOGGLE_EMERGENCY_MODAL" }); }}
    >
      <div className="glass-panel rounded-2xl w-full max-w-lg p-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-error/20 border border-error/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-error">emergency</span>
            </div>
            <div>
              <div className="font-display text-lg text-primary">Emergency Reference</div>
              <div className="text-xs text-on-surface-variant font-mono">TRANSPONDER SQUAWK CODES</div>
            </div>
          </div>
          <button
            onClick={() => dispatch({ type: "TOGGLE_EMERGENCY_MODAL" })}
            className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-lg hover:bg-on-surface/5"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Squawk codes */}
        <div className="flex flex-col gap-3">
          {SQUAWK_CODES.map((sq) => (
            <div key={sq.code} className={`rounded-xl p-4 border ${sq.bg}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`font-mono text-xl font-semibold ${sq.color}`}>{sq.code}</span>
                <span className={`font-mono text-xs ${sq.color} bg-on-surface/5 px-2 py-0.5 rounded`}>{sq.label}</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">{sq.desc}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-on-surface/5 text-[10px] font-mono text-on-surface-variant text-center">
          Emergency frequency: 121.5 MHz (VHF) • 243.0 MHz (UHF/Military)
        </div>
      </div>
    </div>
  );
}
