'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}
export function Button({ variant = 'ghost', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const v = { gold: 'btn-gold', ghost: 'btn-ghost', danger: 'btn-danger', outline: 'btn border border-ink-600 text-chalk hover:bg-ink-700' }[variant];
  const s = { sm: 'btn-sm', md: '', lg: 'btn-lg' }[size];
  return (
    <button className={cn(v, s, 'disabled:opacity-50', className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: ReactNode; className?: string; hover?: boolean; padding?: string; }
export function Card({ children, className, hover, padding = 'p-4' }: CardProps) {
  return <div className={cn(hover ? 'card-hover' : 'card', padding, className)}>{children}</div>;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-8 h-8' }[size];
  return <div className={cn(s, 'border-2 border-ink-600 border-t-gold rounded-full animate-spin', className)} />;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title?: string; children: ReactNode; maxWidth?: string; }
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative card w-full animate-fade-up', maxWidth)}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700">
            <h2 className="font-display text-lg font-bold text-chalk">{title}</h2>
            <button onClick={onClose} className="text-ink-400 hover:text-chalk transition-colors p-1"><X size={16} /></button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
interface Tab { id: string; label: string; icon?: ReactNode; }
interface TabsProps { tabs: Tab[]; activeId: string; onChange: (id: string) => void; className?: string; }
export function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 p-1 bg-ink-900 rounded-xl border border-ink-700', className)}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            activeId === t.id ? 'bg-ink-700 text-chalk shadow-sm' : 'text-ink-400 hover:text-ink-300'
          )}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: string; type: ToastType; message: string; duration?: number; }
interface ToastContextValue { toast: (type: ToastType, message: string, duration?: number) => void; }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, type, message, duration }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration);
  }, []);

  const icons = { success: <CheckCircle size={16} className="text-green-400" />, error: <AlertCircle size={16} className="text-red-400" />, info: <Info size={16} className="text-blue-400" />, warning: <AlertTriangle size={16} className="text-yellow-400" /> };
  const colours = { success: 'border-green-700/50', error: 'border-red-700/50', info: 'border-blue-700/50', warning: 'border-yellow-700/50' };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        {toasts.map(t => (
          <div key={t.id} className={cn('card flex items-center gap-3 px-4 py-3 shadow-xl animate-fade-up border', colours[t.type])}>
            {icons[t.type]}
            <span className="text-sm text-chalk flex-1">{t.message}</span>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} className="text-ink-400 hover:text-chalk flex-shrink-0"><X size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }