import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Mandatory Google Maps Platform Case A Quota & Auth Failure Listeners
declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

window.gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  try {
    const joined = args.map((a) => String(a)).join(' ');
    if (joined.includes('OverQuotaMapError') || joined.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  } catch {
    // Never break console logging
  }
  origConsoleError.apply(console, args);
};

createRoot(document.getElementById('root')!).render(<App />);
