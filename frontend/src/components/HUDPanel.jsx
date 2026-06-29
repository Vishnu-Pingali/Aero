import React from "react";

export function HUDPanel({ aircraft, onClose }) {
  if (!aircraft) return null;

  const altitude = aircraft.altitude_ft ?? 0;
  const speed = aircraft.velocity_kts ?? 0;
  const heading = aircraft.heading ?? 0;
  const vs = aircraft.vertical_rate_fpm ?? 0;

  // Derive pitch and roll from vertical speed and heading for rich animations
  const pitch = Math.min(30, Math.max(-30, vs / 100)); // scale fpm to degrees
  const roll = 0; // can be updated if historical track is parsed for turning

  // Generate speeds for the vertical speed tape (clamped around current speed)
  const speedTicks = [];
  const baseSpeed = Math.floor(speed / 20) * 20;
  for (let i = baseSpeed + 60; i >= baseSpeed - 60; i -= 20) {
    if (i >= 0) speedTicks.push(i);
  }

  // Generate altitudes for the vertical altitude tape (clamped around current altitude)
  const altTicks = [];
  const baseAlt = Math.floor(altitude / 1000) * 1000;
  for (let i = baseAlt + 3000; i >= baseAlt - 3000; i -= 1000) {
    if (i >= 0) altTicks.push(i);
  }

  // Generate headings for the compass tape (0 to 360)
  const headingTicks = [];
  for (let i = -2; i <= 2; i++) {
    const tick = (Math.round(heading / 10) * 10 + i * 10 + 360) % 360;
    headingTicks.push(tick);
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[340px] h-[220px] glass-panel rounded-2xl p-4 flex flex-col gap-2 border border-primary/20 shadow-2xl z-[999] select-none text-primary font-mono text-[10px]">
      {/* Header bar */}
      <div className="flex justify-between items-center border-b border-primary/10 pb-1.5 text-[9px] font-bold text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed animate-ping" />
          PRIMARY FLIGHT INSTRUMENTS (HUD)
        </span>
        <button 
          onClick={onClose} 
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-0.5 hover:bg-primary/10 rounded"
        >
          <span className="material-symbols-outlined text-sm font-bold">close</span>
        </button>
      </div>

      <div className="flex-1 grid grid-cols-[50px_1fr_50px] gap-2 items-center relative overflow-hidden">
        {/* Left Side: Speed Tape */}
        <div className="h-full relative flex items-center justify-end pr-2 border-r border-primary/10 overflow-hidden">
          <div className="absolute right-1 w-8 flex flex-col items-end gap-3 transition-transform duration-500" style={{ transform: `translateY(${(speed % 20) * 1.3}px)` }}>
            {speedTicks.map((val) => (
              <div key={val} className={`flex items-center gap-1 ${val === Math.round(speed) ? "text-[#ffca7a] font-bold" : "opacity-45"}`}>
                <span>{val}</span>
                <span className="w-1 h-[1px] bg-primary" />
              </div>
            ))}
          </div>
          {/* Current Speed Indicator Box */}
          <div className="absolute right-0 w-[42px] py-0.5 px-1 bg-[#ffca7a] text-background font-bold text-center rounded border border-[#ffca7a] z-10 text-[9px] shadow">
            {Math.round(speed)} KTS
          </div>
        </div>

        {/* Center: Attitude Indicator (Horizon pitch/roll) */}
        <div className="h-full relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-background/50 border border-primary/5">
          {/* Horizon Background */}
          <div 
            className="absolute w-[200px] h-[200px] rounded-full transition-transform duration-500 flex flex-col"
            style={{ transform: `translateY(${pitch * 1.5}px) rotate(${roll}deg)` }}
          >
            {/* Sky (Blue) */}
            <div className="flex-1 bg-gradient-to-b from-[#0284c7]/40 to-[#0284c7]/20 border-b border-[#ffca7a]/50" />
            {/* Ground (Brown/Dark) */}
            <div className="flex-1 bg-gradient-to-t from-[#1b1510]/50 to-[#2c2014]/40" />
          </div>

          {/* Static Aircraft Crosshair Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {/* SVG Aircraft symbol */}
            <svg width="60" height="20" viewBox="0 0 60 20" className="drop-shadow-[0_0_4px_#ffca7a]">
              {/* Left wing line */}
              <line x1="5" y1="10" x2="20" y2="10" stroke="#ffca7a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="20" y1="10" x2="25" y2="13" stroke="#ffca7a" strokeWidth="2.5" strokeLinecap="round" />
              {/* Center point indicator */}
              <circle cx="30" cy="10" r="2.5" fill="#ffca7a" />
              {/* Right wing line */}
              <line x1="40" y1="10" x2="55" y2="10" stroke="#ffca7a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="35" y1="13" x2="40" y2="10" stroke="#ffca7a" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Compass / Heading Tape (Top overlay) */}
          <div className="absolute top-1 inset-x-4 h-6 flex justify-center overflow-hidden z-20 border-b border-primary/10">
            <div className="flex items-center gap-5 transition-transform duration-500" style={{ transform: `translateX(${((heading % 10) - 5) * 2.5}px)` }}>
              {headingTicks.map((val) => (
                <div key={val} className="flex flex-col items-center">
                  <span className="text-[8px] opacity-75">{val}°</span>
                  <span className="h-1.5 w-[1px] bg-primary" />
                </div>
              ))}
            </div>
            {/* Heading indicator arrow */}
            <div className="absolute bottom-0 text-[8px] text-[#ffca7a] font-bold">▲</div>
          </div>

          {/* Vertical Speed Indicator (Right overlay) */}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20 bg-background/80 px-1 py-1 rounded border border-primary/10">
            <span className="text-[7px] text-on-surface-variant font-bold">V/S</span>
            <span className={`font-bold ${vs > 0 ? "text-tertiary-fixed" : vs < 0 ? "text-error" : "opacity-50"}`}>
              {vs > 0 ? `+${vs}` : vs}
            </span>
            <span className="text-[6px] text-on-surface-variant">FPM</span>
          </div>
        </div>

        {/* Right Side: Altitude Tape */}
        <div className="h-full relative flex items-center justify-start pl-2 border-l border-primary/10 overflow-hidden">
          <div className="absolute left-1 w-10 flex flex-col items-start gap-3 transition-transform duration-500" style={{ transform: `translateY(${((altitude % 1000) / 1000) * 36}px)` }}>
            {altTicks.map((val) => (
              <div key={val} className={`flex items-center gap-1 ${val === baseAlt ? "text-[#ffca7a] font-bold" : "opacity-45"}`}>
                <span className="w-1 h-[1px] bg-primary" />
                <span>{val}</span>
              </div>
            ))}
          </div>
          {/* Current Altitude Box */}
          <div className="absolute left-0 w-[46px] py-0.5 px-0.5 bg-[#ffca7a] text-background font-bold text-center rounded border border-[#ffca7a] z-10 text-[9px] shadow">
            {altitude.toLocaleString()} FT
          </div>
        </div>
      </div>
    </div>
  );
}
