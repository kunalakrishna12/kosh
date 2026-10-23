import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ui';
import { VaultProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VaultProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </VaultProvider>
  </StrictMode>,
);
