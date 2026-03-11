import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ErrorBoundary({ children }) {
  const [hasError, setHasError] = React.useState(false);
  const [errorInfo, setErrorInfo] = React.useState(null);

  React.useEffect(() => {
    const handleError = (event) => {
      console.error('Caught by ErrorBoundary:', event.error);
      setHasError(true);
      try {
        const parsed = JSON.parse(event.error.message);
        setErrorInfo(parsed);
      } catch (e) {
        setErrorInfo({ error: event.error.message });
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center p-6 z-[9999]">
        <div className="max-w-md w-full bg-bg2 border border-red/50 p-8 rounded-lg shadow-2xl">
          <div className="flex items-center gap-3 text-red mb-4">
            <AlertTriangle size={32} />
            <h2 className="text-xl font-display">System Error</h2>
          </div>
          <p className="text-text/80 mb-6 font-mono text-sm">
            {errorInfo?.error || 'An unexpected error occurred within the Quant Network.'}
          </p>
          {errorInfo?.path && (
            <div className="bg-black/30 p-3 rounded mb-6 font-mono text-[10px] text-muted">
              PATH: {errorInfo.path}<br />
              OP: {errorInfo.operationType}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 border border-cyan text-cyan font-display hover:bg-cyan/10 transition-all"
          >
            Re-Initialize System
          </button>
        </div>
      </div>
    );
  }

  return children;
}
