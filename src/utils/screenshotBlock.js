export function initScreenshotPrevention(qcNumber, onBlock) {
  // 1. PrintScreen key
  const handleKeyDown = (e) => {
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      onBlock(); // triggers blackout + counter
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      onBlock();
    }
    // S key for screenshot on some systems
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      onBlock();
    }
  };
  
  document.addEventListener('keydown', handleKeyDown, true);

  // 2. Right-click disable
  const handleContextMenu = (e) => e.preventDefault();
  document.addEventListener('contextmenu', handleContextMenu);

  // 3. Tab blur protection
  const handleVisibilityChange = () => {
    const app = document.getElementById('qc-app');
    if (!app) return;
    app.style.filter = document.hidden 
      ? 'blur(40px) brightness(0.05)' 
      : '';
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 4. CSS protection via injected style
  const style = document.createElement('style');
  style.id = 'screenshot-prevention-style';
  style.textContent = `
    * { 
      -webkit-user-select: none; 
      user-select: none; 
      -webkit-touch-callout: none; 
    }
    @media print { 
      body { display: none !important; } 
    }
    /* Some browsers attempt to block screenshots via CSS */
    #qc-app {
      -webkit-user-drag: none;
    }
  `;
  document.head.appendChild(style);

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('contextmenu', handleContextMenu);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    const styleEl = document.getElementById('screenshot-prevention-style');
    if (styleEl) styleEl.remove();
  };
}
