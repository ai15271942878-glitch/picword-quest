// ============================================================
// 图片：压缩 / 存 IndexedDB / 远程图固化 / 转 base64 给视觉模型 / React 显示
// ============================================================

import { useEffect, useState } from 'react';
import { db } from './db';
import { fetchImageBlob } from './net';
import type { ChatImage } from './llm/client';

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
}

/** Canvas 压缩：最长边 ≤ maxSide，输出 JPEG（PRD：上传图自动压缩到合理分辨率） */
export async function compressImage(src: Blob, maxSide = 1280, quality = 0.86): Promise<Compressed> {
  const bmp = await createImageBitmap(src);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // PNG 透明底转 JPEG 时垫白
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('图片压缩失败'))), 'image/jpeg', quality));
  return { blob, width: w, height: h };
}

/** 简单字符串哈希（远程 URL → 稳定的图片 ID，避免重复缓存） */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

/** 保存一张 Blob 到 images 表，返回图片 ID */
export async function saveImage(
  blob: Blob,
  opts: { id?: string; sourceUrl?: string; compress?: boolean; width?: number; height?: number } = {},
): Promise<string> {
  const { blob: b, width, height } = opts.compress === false ? { blob, width: opts.width ?? 0, height: opts.height ?? 0 } : await compressImage(blob);
  const id = opts.id ?? `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await db.images.put({ id, blob: b, mime: b.type || 'image/jpeg', width, height, sourceUrl: opts.sourceUrl, createdAt: Date.now() });
  return id;
}

/** 把远程图片固化进 IndexedDB（收藏 AI 关卡 / 收藏生词时调用）；失败返回 null */
export async function cacheRemoteImage(url: string): Promise<string | null> {
  const id = `url-${hashString(url)}`;
  if (await db.images.get(id)) return id;
  try {
    const blob = await fetchImageBlob(url);
    return await saveImage(blob, { id, sourceUrl: url });
  } catch (e) {
    console.warn('[cacheRemoteImage] 固化失败，保留远程链接', url, e);
    return null;
  }
}

/** 读取关卡图片的 Blob（优先库内，其次 URL） */
export async function getImageBlob(ref: { imageId?: string; imageUrl?: string }): Promise<Blob | null> {
  if (ref.imageId) {
    const rec = await db.images.get(ref.imageId);
    if (rec) return rec.blob;
  }
  if (ref.imageUrl) {
    try {
      return await fetchImageBlob(ref.imageUrl);
    } catch {
      return null;
    }
  }
  return null;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).replace(/^data:[^,]*,/, ''));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** 转成给视觉模型的图片：缩到 1024px 以内，省 token */
export async function toChatImage(ref: { imageId?: string; imageUrl?: string } | Blob): Promise<ChatImage | null> {
  const blob = ref instanceof Blob ? ref : await getImageBlob(ref);
  if (!blob) return null;
  const { blob: small } = await compressImage(blob, 1024, 0.82);
  return { mime: 'image/jpeg', base64: await blobToBase64(small) };
}

// ------------------------------------------------------------
// React：把 imageId / imageUrl 解析成可显示的 src
// ------------------------------------------------------------

const objectUrlCache = new Map<string, { url: string; refs: number }>();

async function acquireObjectUrl(imageId: string): Promise<string | null> {
  const hit = objectUrlCache.get(imageId);
  if (hit) {
    hit.refs++;
    return hit.url;
  }
  const rec = await db.images.get(imageId);
  if (!rec) return null;
  const again = objectUrlCache.get(imageId); // 并发获取时防止重复创建
  if (again) {
    again.refs++;
    return again.url;
  }
  const url = URL.createObjectURL(rec.blob);
  objectUrlCache.set(imageId, { url, refs: 1 });
  return url;
}

function releaseObjectUrl(imageId: string) {
  const hit = objectUrlCache.get(imageId);
  if (!hit) return;
  hit.refs--;
  if (hit.refs <= 0) {
    // 延迟释放，避免列表重渲染时反复创建
    setTimeout(() => {
      const cur = objectUrlCache.get(imageId);
      if (cur && cur.refs <= 0) {
        URL.revokeObjectURL(cur.url);
        objectUrlCache.delete(imageId);
      }
    }, 5000);
  }
}

export function useImageSrc(ref: { imageId?: string; imageUrl?: string } | null | undefined): string | undefined {
  const imageId = ref?.imageId;
  const imageUrl = ref?.imageUrl;
  const [src, setSrc] = useState<string | undefined>(imageId ? undefined : imageUrl);
  useEffect(() => {
    let alive = true;
    let acquired = false;
    if (!imageId) {
      setSrc(imageUrl);
      return;
    }
    setSrc(undefined);
    acquireObjectUrl(imageId).then((u) => {
      if (!u) {
        if (alive) setSrc(imageUrl);
        return;
      }
      if (alive) {
        acquired = true;
        setSrc(u);
      } else {
        releaseObjectUrl(imageId); // 组件已卸载：立刻归还引用
      }
    });
    return () => {
      alive = false;
      if (acquired) releaseObjectUrl(imageId);
    };
  }, [imageId, imageUrl]);
  return src;
}
