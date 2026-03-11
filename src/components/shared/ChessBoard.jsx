import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ChessBoard({ onMovesChange }) {
  const [knightPos, setKnightPos] = useState({ x: 2, y: 2 });
  const [moves, setMoves] = useState([]);

  const handleMove = (dir) => {
    let newPos = { ...knightPos };
    switch (dir) {
      case 'U': newPos.y = Math.max(0, newPos.y - 1); break;
      case 'D': newPos.y = Math.min(4, newPos.y + 1); break;
      case 'L': newPos.x = Math.max(0, newPos.x - 1); break;
      case 'R': newPos.x = Math.min(4, newPos.x + 1); break;
      default: break;
    }

    if (newPos.x !== knightPos.x || newPos.y !== knightPos.y) {
      setKnightPos(newPos);
      const newMoves = [...moves, dir];
      setMoves(newMoves);
      onMovesChange(newMoves);
    }
  };

  const reset = () => {
    setKnightPos({ x: 2, y: 2 });
    setMoves([]);
    onMovesChange([]);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid grid-cols-5 gap-1 bg-border p-1 rounded border border-cyan/30">
        {Array.from({ length: 25 }).map((_, i) => {
          const x = i % 5;
          const y = Math.floor(i / 5);
          const isKnight = knightPos.x === x && knightPos.y === y;
          const isDark = (x + y) % 2 === 1;

          return (
            <div
              key={i}
              className={`w-10 h-10 flex items-center justify-center text-xl transition-all duration-300 ${
                isDark ? 'bg-bg3' : 'bg-bg2'
              }`}
            >
              {isKnight && <span className="text-cyan animate-pulse">♞</span>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div />
        <button
          onClick={() => handleMove('U')}
          className="p-2 border border-cyan/50 text-cyan hover:bg-cyan/10 rounded"
        >
          <ChevronUp size={20} />
        </button>
        <div />
        <button
          onClick={() => handleMove('L')}
          className="p-2 border border-cyan/50 text-cyan hover:bg-cyan/10 rounded"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={reset}
          className="p-2 border border-red/50 text-red hover:bg-red/10 rounded text-xs font-mono"
        >
          CLR
        </button>
        <button
          onClick={() => handleMove('R')}
          className="p-2 border border-cyan/50 text-cyan hover:bg-cyan/10 rounded"
        >
          <ChevronRight size={20} />
        </button>
        <div />
        <button
          onClick={() => handleMove('D')}
          className="p-2 border border-cyan/50 text-cyan hover:bg-cyan/10 rounded"
        >
          <ChevronDown size={20} />
        </button>
        <div />
      </div>

      <div className="w-full max-w-[220px] overflow-hidden">
        <p className="text-[10px] text-muted font-mono uppercase mb-1">Sequence ({moves.length}):</p>
        <div className="flex flex-wrap gap-1 font-mono text-cyan text-xs">
          {moves.length === 0 ? 'NO MOVES' : moves.join(' → ')}
        </div>
      </div>
    </div>
  );
}
