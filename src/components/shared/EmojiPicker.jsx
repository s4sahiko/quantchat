import React, { useState } from 'react';

const EMOJI_CATEGORIES = {
  RECENT: ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'],
  SMILEYS: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘'],
  GESTURES: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆'],
  CYBER: ['👻', '🔒', '💀', '👽', '🤖', '👾', '💻', '💾', '📡', '🔋', '🔌', '🕹️', '📱', '📟', '📠', '📺']
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('RECENT');

  return (
    <div className="absolute bottom-full mb-2 bg-bg2 border border-border p-3 rounded-lg shadow-glow-cyan w-64 z-50 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex gap-2 mb-3 border-b border-border pb-2 overflow-x-auto custom-scrollbar">
        {Object.keys(EMOJI_CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-[8px] font-mono uppercase px-2 py-1 rounded transition-all whitespace-nowrap ${
              activeCategory === cat ? 'bg-cyan text-bg' : 'text-muted hover:text-cyan'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      
      <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
        {EMOJI_CATEGORIES[activeCategory].map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="text-xl hover:scale-125 transition-transform p-1 hover:bg-bg3 rounded"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-border flex justify-between items-center">
        <span className="text-[8px] font-mono text-muted uppercase tracking-widest">{activeCategory}</span>
        <button 
          onClick={onClose}
          className="text-[9px] text-muted uppercase hover:text-red font-mono"
        >
          [ESC] CLOSE
        </button>
      </div>
    </div>
  );
}
