import React, { useState, useEffect } from "react";

/**
 * A mechanical split-flap display card for retro-style text transitions.
 */
export function FlipBoard({ text = "", lettersCount = null, className = "" }) {
  const targetText = text || "";
  const displayLength = lettersCount ?? targetText.length;
  const charsArray = targetText.padEnd(displayLength, " ").slice(0, displayLength).split("");

  return (
    <div className={`flex items-center gap-0.5 select-none ${className}`}>
      {charsArray.map((char, index) => (
        <FlipCard key={index} char={char} />
      ))}
    </div>
  );
}

function FlipCard({ char }) {
  const [prevChar, setPrevChar] = useState(char);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (char !== prevChar) {
      setIsFlipping(true);
      const timer = setTimeout(() => {
        setPrevChar(char);
        setIsFlipping(false);
      }, 350); // duration of flip animation
      return () => clearTimeout(timer);
    }
  }, [char, prevChar]);

  return (
    <div className="relative w-[18px] h-[26px] bg-[#0c1926] rounded border border-primary-container/10 flex items-center justify-center font-mono text-xs font-bold text-[#ffca7a] overflow-hidden shadow-inner perspective-300">
      {/* Static top half */}
      <span className="absolute inset-0 flex items-center justify-center">{char}</span>
      
      {/* Split line */}
      <div className="absolute top-[13px] left-0 right-0 h-[1px] bg-background/60 z-10" />

      {/* Flip overlay animation */}
      {isFlipping && (
        <div className="absolute inset-x-0 top-0 bottom-1/2 bg-[#0c1926] flex items-center justify-center border-b border-background/40 origin-bottom animate-split-flap overflow-hidden">
          <span className="translate-y-1/4">{prevChar}</span>
        </div>
      )}
    </div>
  );
}
