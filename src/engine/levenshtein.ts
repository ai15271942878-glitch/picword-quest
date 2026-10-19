// ============================================================
// 编辑距离（离线判卷的拼写纠错核心）
//
// levenshtein(a, b)            经典 Levenshtein：插入 / 删除 / 替换 各算 1 次
// levenshtein(a, b, {transpose:true})
//                              OSA（Optimal String Alignment）变体：
//                              额外允许“相邻两字母互换”算 1 次编辑。
//                              例：recieve → receive 经典距离 = 2，OSA = 1。
//                              打字时手指先后顺序颠倒是最常见的笔误，
//                              所以离线判卷默认使用 OSA。
// ============================================================

export interface DistanceOptions {
  /** 相邻字母换位是否算 1 次编辑（默认 false = 经典 Levenshtein） */
  transpose?: boolean;
  /** 提前终止阈值：确定距离 > max 时直接返回 max + 1（加速大量比对） */
  max?: number;
}

export function levenshtein(a: string, b: string, opts: DistanceOptions = {}): number {
  const { transpose = false, max = Infinity } = opts;
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  // 长度差本身就是距离下界
  if (Math.abs(n - m) > max) return max + 1;

  // 只保留三行：prev2（i-2）、prev（i-1）、cur（i）
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // 删除
        cur[j - 1] + 1, // 插入
        prev[j - 1] + cost, // 替换
      );
      if (
        transpose &&
        i > 1 &&
        j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === cb
      ) {
        v = Math.min(v, prev2[j - 2] + 1); // 相邻换位
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    // 滚动数组
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}

/** 判卷用的默认距离：OSA（换位算 1 次） */
export function typoDistance(a: string, b: string, max = 3): number {
  return levenshtein(a, b, { transpose: true, max });
}
