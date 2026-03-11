import React, { useState, useEffect } from 'react';
import { Send, Delete, Smile, Type, ChevronUp, CornerDownLeft } from 'lucide-react';

const QuantKeyboard = ({ onSend, onClose, initialValue = '' }) => {
    const [text, setText] = useState(initialValue);
    const [mode, setMode] = useState('keys'); // 'keys', 'numbers', 'symbols', 'emojis'

    const rows = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ];

    const numberRows = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['+', '-', '=', '*', '/', '\\', '@', '#', '%', '^'],
    ];

    const symbolRows = [
        ['!', '?', '"', '\'', ':', ';', '(', ')', '[', ']'],
        ['{', '}', '<', '>', '|', '_', '&', '~', '`', '§'],
    ];

    const emojis = [
        '😊', '😂', '🤣', '❤️', '😍', '😒', '👌', '😘', '✨', '🔥',
        '👍', '🙌', '🙏', '💯', '🤔', '👀', '😎', '💀', '😱', '🥳',
        '💻', '🔒', '🛡️', '⚡', '🤖', '🛰️', '🌌', '🧬', '🧪', '📡'
    ];

    const handleKeyPress = (key) => {
        setText((prev) => prev + key);
    };

    const handleBackspace = () => {
        setText((prev) => prev.slice(0, -1));
    };

    const handleSend = () => {
        if (text.trim()) {
            onSend(text);
            setText('');
        }
    };

    // No longer blocking background scrolling to allow WhatsApp-like feel
    useEffect(() => {
        // We could add logic here to scroll the chat into view if needed
    }, []);

    const renderGrid = (keyRows) => (
        <div className="flex flex-col gap-1.5">
            {/* Row 1 & 2 */}
            {keyRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex justify-center gap-1 h-11">
                    {row.map((key) => (
                        <button
                            key={key}
                            onClick={() => handleKeyPress(key)}
                            className="flex-1 max-w-[40px] flex items-center justify-center border border-border/20 bg-bg3/60 text-cyan/90 font-mono text-base active:bg-cyan active:text-bg active:scale-95 transition-all rounded shadow-sm"
                        >
                            {key}
                        </button>
                    ))}
                </div>
            ))}

            {/* Row 3: Shift/Back, Z-M / symbols, $, Backspace */}
            <div className="flex justify-center gap-1 h-11">
                <button
                    onClick={() => mode !== 'keys' ? setMode('keys') : null}
                    className={`flex-1 max-w-[40px] flex items-center justify-center border border-cyan/30 bg-bg3/60 text-cyan active:bg-cyan active:text-bg rounded shadow-sm transition-all ${mode !== 'keys' ? 'opacity-100' : 'opacity-40'}`}
                >
                    {mode === 'keys' ? <ChevronUp size={22} /> : <span className="text-[10px] font-display font-bold">ABC</span>}
                </button>
                {(mode === 'keys' ? ['Z', 'X', 'C', 'V', 'B', 'N', 'M'] : mode === 'numbers' ? ['€', '£', '¥', '₩', '°', '·', '…'] : ['×', '÷', '±', '√', '∞', '∆', '≈']).map((key) => (
                    <button
                        key={key}
                        onClick={() => handleKeyPress(key)}
                        className="flex-1 max-w-[40px] flex items-center justify-center border border-border/20 bg-bg3/60 text-cyan/90 font-mono text-lg active:bg-cyan active:text-bg active:scale-95 transition-all rounded shadow-sm"
                    >
                        {key}
                    </button>
                ))}
                <button
                    onClick={() => handleKeyPress(mode === 'keys' ? '$' : mode === 'numbers' ? ',' : '_')}
                    className="flex-1 max-w-[40px] flex items-center justify-center border border-border/20 bg-bg3/60 text-cyan/90 font-mono text-lg active:bg-cyan active:text-bg rounded shadow-sm transition-all"
                >
                    {mode === 'keys' ? '$' : mode === 'numbers' ? ',' : '_'}
                </button>
                <button
                    onClick={handleBackspace}
                    className="flex-1 max-w-[40px] flex items-center justify-center border border-red/30 bg-bg3/60 text-red active:bg-red active:text-white active:scale-90 transition-all rounded shadow-sm"
                >
                    <Delete size={22} />
                </button>
            </div>

            {/* Row 4: 123, ., Space, !?, Enter */}
            <div className="flex justify-center gap-1 h-11 pb-2">
                <button
                    onClick={() => setMode(mode === 'numbers' ? 'keys' : 'numbers')}
                    className={`flex-[1.2] flex items-center justify-center border border-cyan/20 bg-bg3/60 text-cyan/70 font-display text-[9px] uppercase tracking-tighter active:bg-cyan active:text-bg rounded shadow-sm transition-all ${mode === 'numbers' ? 'bg-cyan text-bg' : ''}`}
                >
                    {mode === 'numbers' ? 'ABC' : '123'}
                </button>
                <button
                    onClick={() => handleKeyPress('.')}
                    className="flex-[0.8] flex items-center justify-center border border-border/20 bg-bg3/60 text-cyan/90 font-mono text-lg active:bg-cyan active:text-bg rounded shadow-sm transition-all"
                >
                    .
                </button>
                <button
                    onClick={() => handleKeyPress(' ')}
                    className="flex-[4] flex items-center justify-center border border-border/20 bg-bg3/60 active:bg-cyan active:scale-[0.98] transition-all rounded shadow-sm relative group"
                >
                    <div className="w-12 h-0.5 bg-cyan/40 rounded-full group-active:bg-bg/40" />
                    <span className="absolute bottom-1 text-[8px] font-display text-cyan/20 uppercase tracking-[0.2em]">Space</span>
                </button>
                <button
                    onClick={() => setMode(mode === 'symbols' ? 'keys' : 'symbols')}
                    className={`flex-[1] flex items-center justify-center border border-border/20 bg-bg3/60 text-cyan/70 font-mono text-sm active:bg-cyan active:text-bg rounded shadow-sm transition-all ${mode === 'symbols' ? 'bg-cyan text-bg' : ''}`}
                >
                    {mode === 'symbols' ? 'ABC' : '!?'}
                </button>
                <button
                    onClick={handleSend}
                    className="flex-[1.2] flex items-center justify-center border border-cyan/50 bg-cyan/10 text-cyan active:bg-cyan active:text-bg active:scale-90 transition-all rounded shadow-sm shadow-glow-cyan/20"
                >
                    <CornerDownLeft size={22} />
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[200] flex flex-col bg-bg/95 backdrop-blur-md animate-in slide-in-from-bottom duration-300 sm:hidden border-t border-cyan/30 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pb-1">
            {/* WhatsApp-style Input Bar - Quant Themed */}
            <div className="px-3 py-2 flex items-center gap-2 bg-bg2/40 border-b border-cyan/10">
                <button
                    onClick={() => setMode(mode === 'emojis' ? 'keys' : 'emojis')}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors active:scale-90 ${mode === 'emojis' ? 'text-bg bg-cyan' : 'text-cyan hover:bg-cyan/10'}`}
                >
                    {mode !== 'emojis' ? <Smile size={24} /> : <Type size={24} />}
                </button>

                <div className="flex-1 h-11 bg-bg3/80 border border-cyan/20 rounded-2xl flex items-center px-4 shadow-inner shadow-glow-cyan/5">
                    <div className="flex-1 overflow-x-auto whitespace-nowrap custom-scrollbar py-1">
                        <p className="text-[14px] font-mono text-text whitespace-pre-wrap">
                            {text}<span className="inline-block w-1.5 h-4 bg-cyan animate-pulse ml-0.5 align-middle" />
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSend}
                    disabled={!text.trim()}
                    className="w-11 h-11 bg-cyan text-bg flex items-center justify-center rounded-full shadow-glow-cyan disabled:opacity-40 active:scale-90 transition-all"
                >
                    <Send size={20} className="ml-0.5" />
                </button>
            </div>

            {/* Keyboard Grid - Dynamic Context Support */}
            <div className="p-1 px-1.5 flex flex-col gap-2 justify-center bg-bg/40 select-none pb-4">
                {mode === 'keys' && renderGrid(rows)}
                {mode === 'numbers' && renderGrid(numberRows)}
                {mode === 'symbols' && renderGrid(symbolRows)}
                {mode === 'emojis' && (
                    <div className="grid grid-cols-6 gap-2 h-[180px] overflow-y-auto custom-scrollbar px-2 py-1 pb-4">
                        {emojis.map((emoji) => (
                            <button
                                key={emoji}
                                onClick={() => handleKeyPress(emoji)}
                                className="h-10 text-xl flex items-center justify-center bg-bg3/40 rounded border border-border/10 active:scale-90 transition-all hover:bg-cyan/5"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {/* Height Spacer for better feel on mobile */}
            <div className="h-6 bg-bg2/40" />
        </div>
    );
};

export default QuantKeyboard;
