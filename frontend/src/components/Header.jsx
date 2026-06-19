import { useEffect, useState } from "react";
import { useStore } from "../store/AppStore";

export default function Header() {
  const { state, dispatch } = useStore();
  const [utcTime, setUtcTime] = useState("");


  // UTC clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcTime(
        now.toISOString().slice(11, 19) + " UTC"
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);



  const connectionStyles = {
    LIVE:       "text-tertiary-fixed bg-tertiary-fixed/10 border-tertiary-fixed/30",
    SYNCING:    "text-secondary bg-secondary/10 border-secondary/30",
    DEGRADED:   "text-error bg-error/10 border-error/30",
    CONNECTING: "text-on-surface-variant bg-on-surface/5 border-on-surface/10",
  };



  return (
    <header className="fixed top-0 left-0 w-full z-[1000] flex justify-between items-center px-gutter h-16 bg-surface/70 backdrop-blur-xl border-b border-on-surface/10">
      {/* Left: brand */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-container/20 border border-primary-container/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-container text-lg">flight_takeoff</span>
          </div>
          <span className="font-display text-2xl font-semibold text-primary tracking-tight">AERO TRACK</span>
        </div>
        <span
          className={`font-mono text-xs px-3 py-1 rounded-full border transition-all ${connectionStyles[state.connection] || connectionStyles.CONNECTING}`}
        >
          {state.connection}
        </span>
      </div>

      {/* Right: clock + countdown + theme + emergency */}
      <div className="flex items-center gap-4">
        {/* UTC clock */}
        <span className="hidden md:block font-mono text-xs text-on-surface-variant tabular-nums">
          {utcTime}
        </span>




        {/* Theme toggle cockpit switch */}
        <div className="flex items-center gap-2 border border-on-surface/10 px-3 py-1 rounded-xl bg-surface-container-low/50">
          <span className="font-mono text-[9px] text-on-surface-variant tracking-wider">HUD THEME</span>
          <label className="cockpit-switch" title={state.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <input
              id="theme-toggle-btn"
              type="checkbox"
              className="cockpit-switch-input"
              checked={state.theme === "light"}
              onChange={() => dispatch({ type: "TOGGLE_THEME" })}
            />
            <div className="cockpit-switch-track">
              <div className="cockpit-switch-lever"></div>
            </div>
            <div className="cockpit-switch-indicator"></div>
          </label>
        </div>

        {/* Emergency button */}
        <button
          id="emergency-btn"
          onClick={() => dispatch({ type: "TOGGLE_EMERGENCY_MODAL" })}
          className="bg-error-container text-on-error-container px-5 py-2 rounded-full font-mono text-xs hover:brightness-110 transition-all border border-error/20 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">emergency</span>
          Emergency
        </button>
      </div>
    </header>
  );
}
