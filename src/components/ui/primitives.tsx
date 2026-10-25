// ============================================================
// 基础 UI 组件：按钮 / 弹窗 / 发音按钮 / 关联度条 / 分级标签 / 加载圈 / 收藏星
// ============================================================

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { speak, ttsSupported } from '../../services/tts';
import { useBackClose } from '../../services/backButton';
import type { JudgeStatus, Tier } from '../../types';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'violet';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-indigo-400 hover:text-indigo-700 hover:bg-indigo-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/20',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
  violet: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-500/20',
};
const SIZE: Record<Size, string> = {
  xs: 'text-xs px-2 py-1 rounded-md',
  sm: 'text-[13px] px-2.5 py-1.5 rounded-lg',
  md: 'text-sm px-3.5 py-2 rounded-lg',
  lg: 'text-base px-5 py-2.5 rounded-xl',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  actions,
  width = 'max-w-5xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className={cx('animate-pop flex max-h-[94vh] w-full flex-col rounded-2xl bg-white shadow-2xl', width)}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="关闭">
              ✕ 关闭
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SpeakButton({ text, className, size = 'sm' }: { text: string; className?: string; size?: 'sm' | 'md' }) {
  if (!ttsSupported()) return null;
  return (
    <button
      type="button"
      title={`朗读 ${text}`}
      aria-label={`朗读 ${text}`}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-indigo-600 transition hover:bg-indigo-100 active:scale-90',
        size === 'sm' ? 'h-6 w-6 text-sm' : 'h-8 w-8 text-base',
        className,
      )}
    >
      🔊
    </button>
  );
}

export function relColor(rel: number): string {
  if (rel >= 85) return 'bg-emerald-500';
  if (rel >= 70) return 'bg-sky-500';
  if (rel >= 40) return 'bg-amber-400';
  return 'bg-rose-400';
}

export function RelevanceBar({ value, compact }: { value: number; compact?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2', compact ? 'w-24' : 'w-full')}>
      <div className="relative h-2 flex-1 rounded-full bg-slate-200" title={`画面关联度 ${value}%（70% 为达标线）`}>
        <div className={cx('h-2 rounded-full transition-all duration-700', relColor(value))} style={{ width: `${Math.max(2, value)}%` }} />
        <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-slate-500/70" style={{ left: '70%' }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-600">{value}%</span>
    </div>
  );
}

const TIER_STYLE: Record<string, [string, string]> = {
  core: ['核心', 'bg-emerald-100 text-emerald-700'],
  adv: ['高阶', 'bg-indigo-100 text-indigo-700'],
  weak: ['联想', 'bg-amber-100 text-amber-700'],
  none: ['无关', 'bg-slate-100 text-slate-500'],
};

export function TierBadge({ tier, status }: { tier: Tier | 'none'; status?: JudgeStatus }) {
  let [label, cls] = TIER_STYLE[tier] ?? TIER_STYLE.none;
  if (status === 'unknown') [label, cls] = ['未收录', 'bg-slate-100 text-slate-500'];
  if (status === 'invalid') [label, cls] = ['无效', 'bg-rose-100 text-rose-600'];
  if (status === 'duplicate') [label, cls] = ['重复', 'bg-slate-200 text-slate-600'];
  return <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-bold', cls)}>{label}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

export function StarToggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={on ? '已收藏到本图（点击取消）' : '收藏到本图的视觉生词本'}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition active:scale-95',
        on ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700',
      )}
    >
      {on ? '★ 已收藏' : '☆ 收藏到本图'}
    </button>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-slate-500">
      <div className="text-5xl">{icon}</div>
      <div className="text-base font-semibold text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  );
}
