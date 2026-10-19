import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './primitives';

type ToastType = 'info' | 'success' | 'warn' | 'error';
interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

const ToastCtx = createContext<(text: string, type?: ToastType, ms?: number) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

const STYLE: Record<ToastType, string> = {
  info: 'bg-slate-800 text-white',
  success: 'bg-emerald-600 text-white',
  warn: 'bg-amber-500 text-white',
  error: 'bg-rose-600 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, type: ToastType = 'info', ms = 3600) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, text, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-3">
        {items.map((t) => (
          <div key={t.id} role="status" className={cx('animate-pop pointer-events-auto max-w-xl rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg', STYLE[t.type])}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
