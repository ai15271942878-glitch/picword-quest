// ============================================================
// 📈 战绩统计（【新增】）+ ❔ 玩法说明
// ============================================================

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { MAX_BOX } from '../../services/srs';
import { useGame } from '../../game/GameContext';
import { SEED_LEVELS } from '../../data/seedLevels';
import { Button, Empty, Modal, cx } from '../ui/primitives';
import { useDialog } from '../ui/Dialog';

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function streakDays(times: number[]): number {
  const days = new Set(times.map(dayKey));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1); // 今天还没玩：从昨天往前数
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function Stat({ label, value, sub, cls }: { label: string; value: string | number; sub?: string; cls?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      {/* 颜色二选一：同时写两个 text-* 时谁生效取决于 CSS 顺序，不是书写顺序 */}
      <div className={cx('mt-0.5 text-2xl font-extrabold tabular-nums', cls ?? 'text-slate-800')}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** 用时：754 → 12′34″ */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}′${String(s % 60).padStart(2, '0')}″`;
}

export function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const history = useLiveQuery(() => db.history.orderBy('playedAt').reverse().toArray(), []) ?? [];
  const vocab = useLiveQuery(() => db.vocabBook.toArray(), []) ?? [];
  const libCount = useLiveQuery(() => db.levels.count(), []) ?? 0;
  const played = useLiveQuery(() => db.settings.get('playedSeeds'), [])?.value as string[] | undefined;
  const dialog = useDialog();

  const n = history.length;
  const passes = history.filter((h) => h.passed).length;
  const avg = n ? Math.round(history.reduce((a, h) => a + h.score, 0) / n) : 0;
  const best = n ? Math.max(...history.map((h) => h.score)) : 0;
  const words = history.reduce((a, h) => a + h.wordCount, 0);
  const aiN = history.filter((h) => h.mode === 'ai').length;
  const avgTime = n ? Math.round(history.reduce((a, h) => a + h.durationSec, 0) / n) : 0;
  const passTimes = history.filter((h) => h.passed).map((h) => h.durationSec);
  const fastestPass = passTimes.length ? Math.min(...passTimes) : null;
  const now = Date.now();

  return (
    <Modal open={open} onClose={onClose} title="📈 我的战绩" subtitle="所有记录都保存在本地 IndexedDB" width="max-w-4xl">
      {!n ? (
        <Empty icon="🏁" title="还没有通关记录">玩完第一关就会出现在这里。</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="已玩局数" value={n} sub={`AI 判卷 ${aiN} · 离线 ${n - aiN}`} />
            <Stat label="过关率" value={`${Math.round((passes / n) * 100)}%`} sub={`${passes} 局及格`} cls="text-emerald-600" />
            <Stat label="平均分 / 最高分" value={`${avg} / ${best}`} />
            <Stat label="连续打卡" value={`${streakDays(history.map((h) => h.playedAt))} 天`} sub="每天至少玩一局" cls="text-orange-500" />
            <Stat label="累计写出单词" value={words} sub={`平均每局 ${Math.round(words / n)} 个`} />
            <Stat label="平均用时" value={fmtDuration(avgTime)} sub={fastestPass === null ? '还没有过关记录' : `最快过关 ${fmtDuration(fastestPass)}`} cls="text-sky-600" />
            <Stat label="内置关卡进度" value={`${played?.length ?? 0} / ${SEED_LEVELS.length}`} sub="本轮已玩" />
            <Stat
              label="生词本"
              value={vocab.length}
              sub={`待复习 ${vocab.filter((v) => v.due <= now).length} · 已掌握 ${vocab.filter((v) => v.box >= MAX_BOX).length} · 关卡库 ${libCount}`}
              cls="text-violet-600"
            />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-bold text-slate-700">🕘 最近 {Math.min(20, n)} 局</h4>
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">时间</th>
                    <th className="px-3 py-2">关卡</th>
                    <th className="px-3 py-2 text-right">得分</th>
                    <th className="px-3 py-2 text-right">达标 / 及格</th>
                    <th className="px-3 py-2 text-right">写词</th>
                    <th className="px-3 py-2 text-right">用时</th>
                    <th className="px-3 py-2">方式</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((h) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-500">{new Date(h.playedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 font-semibold">{h.levelTitle}</td>
                      <td className={cx('px-3 py-1.5 text-right font-bold tabular-nums', h.passed ? 'text-emerald-600' : 'text-amber-600')}>{h.score}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {Number.isInteger(h.nValid) ? h.nValid : h.nValid.toFixed(1)} / {h.nPass}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{h.wordCount}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtDuration(h.durationSec)}</td>
                      <td className="px-3 py-1.5 text-xs">{h.mode === 'ai' ? '🤖 AI' : '📴 离线'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                if (await dialog.confirm('清空全部通关记录？', { danger: true, okText: '清空' })) await db.history.clear();
              }}
            >
              清空记录
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useGame();
  const nPass = session?.nPass ?? 6;
  return (
    <Modal open={open} onClose={onClose} title="❔ 玩法说明" width="max-w-3xl">
      <div className="space-y-4 text-sm leading-relaxed text-slate-700">
        <section>
          <h3 className="mb-1 font-bold text-slate-800">🎯 怎么玩</h3>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>仔细观察真实照片（点图片可以放大看细节）。</li>
            <li>写出与画面相关的英文：看得见的东西（名词）、正在发生的动作、状态和氛围（动词 / 形容词）都算。</li>
            <li>达到“及格词数”即可过关；写得越多、越贴近画面，分数越高。</li>
            <li>判卷后可以把生词连同这张图收藏进<b>视觉生词本</b>，以后看图复习。</li>
          </ol>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-slate-800">📲 装到手机桌面（像 App 一样玩）</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <b>安卓 App</b>：
              <a href="./download/picword.apk" download="picword.apk" className="font-semibold text-indigo-600 underline">
                下载 picword.apk
              </a>
              ，打开后按提示安装（第一次需要允许“安装未知来源应用”）。可以把这个链接直接发给朋友。
            </li>
            <li>
              <b>安卓浏览器</b>（Chrome / Edge）也可以不下载：点浏览器菜单 ⋮ →「添加到主屏幕」或「安装应用」。
            </li>
            <li>
              <b>苹果</b>（必须用 Safari）：点底部分享按钮 <span className="whitespace-nowrap">⬆️</span> →「添加到主屏幕」。
            </li>
            <li>装好后从桌面图标打开：全屏、没有地址栏；打开过一次后<b>断网也能玩内置关卡</b>（AI、云端同步需要联网）。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-slate-800">🧮 计分规则（透明、可复算）</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              每个词的<b>画面关联度 ≥ 70%</b> 才算“达标词”：拼写正确计 <b>1</b> 个，轻微拼错计 <b>0.5</b> 个；关联度 &lt; 70% 计 0。
            </li>
            <li>
              有效达标词 N<sub>valid</sub> 没到及格数 N<sub>pass</sub> 时：总分 = round(N<sub>valid</sub> ÷ N<sub>pass</sub> × 60)，<b>绝不及格</b>。
              例：N<sub>pass</sub> = 6，写出 5 个 → 50 分。
            </li>
            <li>
              达到及格数后：总分 = 60 + 超额分（最多 30，写到满分目标 N<sub>full</sub> ≈ 1.45 × N<sub>pass</sub> 拿满）+ 质量分（最多 10，达标词平均关联度从 70% 到 95% 线性给分）。
            </li>
            <li>当前关卡每个达标词约值 {(60 / nPass).toFixed(1)} 分。同一个词的不同写法（如 taxi / cab、car / cars）只算一次。</li>
            <li>开启 AI 时，AI 只判定“拼写状态 + 关联度”，总分仍由上面的公式计算。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-slate-800">⌨️ 快捷键</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Enter 添加单词；用逗号分隔可一次添加多个</li>
            <li>写错了点单词标签上的 × 删除（Backspace 不会误删已添加的词）</li>
            <li>Ctrl + Enter 提交判卷；Esc 关闭弹窗</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-slate-800">🤖 离线 vs AI</h3>
          <p>
            <b>离线模式</b>：用本关自带词库 + 词形变化（复数、时态、比较级、英式拼写）+ 编辑距离纠错，零延迟零费用，但词库外的词无法识别。
            <br />
            <b>AI 模式</b>：能识别词库外的词，并给出动态推荐；AI 认可的新词会沉淀进本关词库，以后离线也能识别。
          </p>
        </section>
        <section className="text-xs text-slate-500">
          内置关卡的 21 张照片均来自 StockSnap / WordPress Photo Directory / rawpixel 公有领域（CC0），经 Openverse 检索；每张图的作者与来源见图片下方。
        </section>
      </div>
    </Modal>
  );
}
