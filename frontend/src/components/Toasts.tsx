// Short-lived messages for things that happen away from where the user is
// looking: a save that the server refused, an undo for a removal.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastInput = {
  text: string;
  kind?: 'info' | 'good' | 'bad';
  action?: { label: string; run: () => void };
};
type Toast = ToastInput & { id: number };

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      // Failures stay long enough to read; confirmations get out of the way.
      setTimeout(() => dismiss(id), t.kind === 'bad' ? 8000 : t.action ? 6000 : 3000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? 'info'}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="linkish"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="linkish close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
