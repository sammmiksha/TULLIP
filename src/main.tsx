import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppLockBoundary } from './components/AppLock';
import './theme.css';
import './styles.css';
import './journal.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AppLockBoundary><App /></AppLockBoundary></StrictMode>);
