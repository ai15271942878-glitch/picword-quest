import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { GameProvider } from './game/GameContext';
import { ToastProvider } from './components/ui/Toast';
import { DialogProvider } from './components/ui/Dialog';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <DialogProvider>
        <GameProvider>
          <App />
        </GameProvider>
      </DialogProvider>
    </ToastProvider>
  </StrictMode>,
);
