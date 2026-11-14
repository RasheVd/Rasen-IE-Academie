import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './Icon';

export const colorVar = (color?: string | null) => ({ '--c': color ? `var(--${color})` : 'var(--ink)' }) as React.CSSProperties;

/* ── Focus management for overlays ────────────────────────── */
function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? el?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => { el?.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return ref;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialogFocus(onClose);
  const id = useId();
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="modal-head">
          <h2 id={id} className="h-section">{title}</h2>
          <button className="btn icon sm" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="t">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ── Confirm dialog (promise based) ───────────────────────── */
type ConfirmReq = { title: string; body: ReactNode; confirm: string; danger?: boolean; resolve: (ok: boolean) => void };
let pending: ConfirmReq | null = null;
const confirmListeners = new Set<() => void>();
export function confirmDialog(opts: Omit<ConfirmReq, 'resolve' | 'confirm'> & { confirm?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { confirm: 'Lanjut', ...opts, resolve };
    confirmListeners.forEach((l) => l());
  });
}
export function ConfirmHost() {
  const req = useSyncExternalStore((l) => { confirmListeners.add(l); return () => confirmListeners.delete(l); }, () => pending);
  if (!req) return null;
  const done = (ok: boolean) => { pending = null; confirmListeners.forEach((l) => l()); req.resolve(ok); };
  return (
    <Modal title={req.title} onClose={() => done(false)} footer={<>
      <button className="btn" onClick={() => done(false)}>Batal</button>
      <button className={`btn ${req.danger ? 'danger solid' : 'primary'}`} onClick={() => done(true)} data-autofocus>{req.confirm}</button>
    </>}>
      <div>{req.body}</div>
    </Modal>
  );
}

/** Text input that commits on blur/Enter — for inline editing without save buttons. */
export function InlineInput({ value, onCommit, className = 'input', placeholder, type = 'text', ariaLabel, ...rest }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; type?: string; ariaLabel?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  return (
    <input {...rest} className={className} type={type} value={v} placeholder={placeholder} aria-label={ariaLabel}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); } }} />
  );
}
