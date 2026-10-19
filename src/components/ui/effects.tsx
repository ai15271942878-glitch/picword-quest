// ============================================================
// 视觉特效：过关彩带（纯 Canvas，无依赖）+ 图片灯箱（滚轮缩放 / 拖拽平移）
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** 过关彩带：intensity 1 = 普通过关，2 = 高分 / 满分 */
export function fireConfetti(intensity: 1 | 2 = 1) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80';
  document.body.appendChild(canvas);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#facc15'];
  const n = intensity === 2 ? 220 : 120;
  const parts = Array.from({ length: n }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 : innerWidth + 10,
      y: innerHeight * (0.55 + Math.random() * 0.3),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9),
      vy: -(11 + Math.random() * 10),
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
    };
  });
  const t0 = performance.now();
  const frame = (t: number) => {
    const el = t - t0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - el / 3200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (el < 3200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
  // 兜底：页面在后台时 rAF 暂停，到点也要把画布移除
  setTimeout(() => canvas.remove(), 4000);
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex select-none items-center justify-center overflow-hidden bg-black/90"
      onWheel={(e) => setScale((s) => Math.min(6, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
      onMouseDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
      }}
      onMouseMove={(e) => {
        if (!drag.current || scale === 1) return;
        setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
      }}
      onMouseUp={(e) => {
        const d = drag.current;
        drag.current = null;
        // 没拖动且点在背景上 → 关闭
        if (d && Math.abs(e.clientX - d.x) < 4 && Math.abs(e.clientY - d.y) < 4 && e.target === e.currentTarget) onClose();
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={reset}
        className="max-h-[92vh] max-w-[96vw] rounded-lg shadow-2xl transition-transform duration-75"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        onClick={() => scale === 1 && setScale(2)}
      />
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-4 py-1.5 text-xs text-white/90">
        滚轮缩放 · 拖拽平移 · 双击复原 · Esc 关闭（{Math.round(scale * 100)}%）
      </div>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25">
        ✕ 关闭
      </button>
    </div>,
    document.body,
  );
}
