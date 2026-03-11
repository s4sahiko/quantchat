import React from 'react';

export default function Watermark({ qcNumber }) {
  if (!qcNumber) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[1000] opacity-[0.03] overflow-hidden select-none">
      <div className="flex flex-wrap gap-20 p-10 rotate-[-25deg] scale-150">
        {Array.from({ length: 100 }).map((_, i) => (
          <span key={i} className="text-cyan font-mono text-xl whitespace-nowrap">
            {qcNumber}
          </span>
        ))}
      </div>
    </div>
  );
}
