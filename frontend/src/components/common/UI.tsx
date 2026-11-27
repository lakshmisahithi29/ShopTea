import React from 'react';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-amber-600 text-white hover:bg-amber-700',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description ? <p className="text-sm text-slate-500 mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-slate-300 mb-3" />
      <p className="font-semibold text-slate-800">{title}</p>
      {description ? <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{message}</span>
      {onRetry ? <button type="button" onClick={onRetry} className="font-semibold whitespace-nowrap">Retry</button> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />{label}
    </div>
  );
}

export function StatusBadge({ children, tone = 'neutral' }: {
  children: React.ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
  const tones = {
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    neutral: 'bg-slate-100 text-slate-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', busy = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-50" aria-label="Close dialog"><X className="h-5 w-5" /></button>
        </div>
        <div className="text-sm text-slate-600 mb-5">{description}</div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button type="button" variant={tone} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
