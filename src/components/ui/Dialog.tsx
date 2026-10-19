// 自制确认框 / 输入框（替代浏览器原生 confirm / prompt：样式统一、不阻塞页面）
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Modal } from './primitives';

interface DialogState {
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  value: string;
  danger?: boolean;
  okText?: string;
}

interface DialogApi {
  confirm: (title: string, opts?: { message?: string; danger?: boolean; okText?: string }) => Promise<boolean>;
  prompt: (title: string, opts?: { message?: string; defaultValue?: string; okText?: string }) => Promise<string | null>;
}

const Ctx = createContext<DialogApi>({ confirm: async () => false, prompt: async () => null });
export const useDialog = () => useContext(Ctx);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<((v: boolean | string | null) => void) | null>(null);

  const close = (v: boolean | string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  const confirm = useCallback<DialogApi['confirm']>(
    (title, opts = {}) =>
      new Promise((res) => {
        resolver.current = (v) => res(v === true);
        setState({ kind: 'confirm', title, message: opts.message, value: '', danger: opts.danger, okText: opts.okText });
      }),
    [],
  );
  const prompt = useCallback<DialogApi['prompt']>(
    (title, opts = {}) =>
      new Promise((res) => {
        resolver.current = (v) => res(typeof v === 'string' ? v : null);
        setState({ kind: 'prompt', title, message: opts.message, value: opts.defaultValue ?? '', okText: opts.okText });
      }),
    [],
  );

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {state && (
        <Modal open onClose={() => close(state.kind === 'confirm' ? false : null)} title={state.title} width="max-w-md">
          {state.message && <p className="mb-3 text-sm text-slate-600">{state.message}</p>}
          {state.kind === 'prompt' && (
            <input
              autoFocus
              value={state.value}
              onChange={(e) => setState({ ...state, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && close(state.value.trim() || null)}
              maxLength={30}
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => close(state.kind === 'confirm' ? false : null)}>取消</Button>
            <Button
              autoFocus={state.kind === 'confirm'}
              variant={state.danger ? 'danger' : 'primary'}
              onClick={() => close(state.kind === 'confirm' ? true : state.value.trim() || null)}
            >
              {state.okText ?? '确定'}
            </Button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}
