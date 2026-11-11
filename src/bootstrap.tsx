import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

export function mount() {
  const host = document.getElementById('root');
  if (!host) throw new Error('The application root element is missing.');
  createRoot(host).render(<ErrorBoundary><App /></ErrorBoundary>);
}
