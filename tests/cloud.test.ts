import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CloudModule from '../src/services/cloud';
import { clearAllData } from '../src/services/backup';
import { deleteDict, importDictPack } from '../src/services/dictionary';
import { db } from '../src/services/db';
import type { VocabItem } from '../src/types';

// ---- 内存版 Supabase：存储桶 + 登录状态 ----
const files = new Map<string, Blob>();
let session: { user: { id: string; email: string } } | null = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) =>
        password === 'right-pw'
          ? ((session = { user: { id: 'u1', email } }), { data: { user: session.user }, error: null })
          : { data: {}, error: { message: 'Invalid login credentials' } },
      signOut: async () => ((session = null), {}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: {
      from: () => ({
        download: async (path: string) =>
          files.has(path) ? { data: files.get(path), error: null } : { data: null, error: { message: 'Object not found', status: 404 } },
        upload: async (path: string, body: Blob) => {
          if (!session || !path.startsWith(`${session.user.id}/`)) return { error: { message: 'new row violates row-level security policy' } };
          files.set(path, body);
          return { error: null };
        },
      }),
    },
  }),
}));

let cloud: typeof CloudModule;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  cloud = await import('../src/services/cloud');
});

beforeEach(async () => {
  files.clear();
  session = null;
  await clearAllData();
  await deleteDict();
});

function vocab(word: string): VocabItem {
  return { key: `lv|${word}`, word, pos: 'n.', meaning: word, relevance: 90, tier: 'core', levelId: 'lv', levelTitle: 'L', createdAt: 1, box: 1, due: 0 } as VocabItem;
}

function makePack(): Blob {
  const pages = [
    { page: 3, bytes: [1, 2, 3, 4, 5, 6, 7] },
    { page: 9, bytes: [9, 8, 7, 6, 5] },
  ];
  let offset = 0;
  const meta = pages.map((p) => ({ page: p.page, offset: (offset += p.bytes.length) - p.bytes.length, length: p.bytes.length, mime: 'image/jpeg', width: 4, height: 6, title: `P${p.page}` }));
  const header = new TextEncoder().encode(
    JSON.stringify({ name: 'DK', pages: meta, entries: [{ en: 'sheep', zh: '绵羊', py: 'miányáng', page: 9, box: [0.1, 0.2, 0.1, 0.05] }] }),
  );
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([new TextEncoder().encode('PWDICT1\n'), len, header, ...pages.map((p) => new Uint8Array(p.bytes))]);
}

describe('云端账号', () => {
  it('配置读取自环境变量', () => expect(cloud.cloudConfigured()).toBe(true));

  it('密码错误 → 中文提示；没登录不能同步', async () => {
    await expect(cloud.signIn('a@b.c', 'wrong')).rejects.toSatisfy((e) => cloud.cloudErrorText(e) === '邮箱或密码不对');
    await expect(cloud.syncDataWithCloud()).rejects.toThrow('请先登录');
  });

  it('存档：首次上传；另一台设备登录后合并拉取', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    await db.vocabBook.add(vocab('apple'));
    expect((await cloud.syncDataWithCloud()).pulled).toBeNull();
    expect(files.has('u1/data.json')).toBe(true);

    // “另一台设备”：本机清空，只有 banana
    await clearAllData();
    await db.vocabBook.add(vocab('banana'));
    const r = await cloud.syncDataWithCloud();
    expect(r.pulled?.vocab).toBe(1);
    expect((await db.vocabBook.toArray()).map((v) => v.word).sort()).toEqual(['apple', 'banana']);
    const uploaded = JSON.parse(await files.get('u1/data.json')!.text());
    expect(uploaded.data.vocabBook).toHaveLength(2);
  });

  it('词典：本机重新打包 → 分块上传 → 另一台设备下载还原，内容一致', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    await importDictPack(makePack(), 'dk.pwdict');
    const m = await cloud.uploadDictToCloud(undefined, 64);
    expect(m.parts).toBeGreaterThan(1);
    expect(files.has('u1/dict/manifest.json')).toBe(true);

    await deleteDict();
    const meta = await cloud.downloadDictFromCloud();
    expect(meta).toMatchObject({ name: 'DK', pageCount: 2, entryCount: 1 });
    const p9 = await db.dictPages.get(9);
    expect([...new Uint8Array(await p9!.blob.arrayBuffer())]).toEqual([9, 8, 7, 6, 5]);
    expect(p9!.title).toBe('P9');
    expect((await db.dictEntries.toArray())[0]).toMatchObject({ en: 'sheep', py: 'miányáng', box: [0.1, 0.2, 0.1, 0.05] });
  });

  it('词典：本机没有词典不能上传；云端缺块时报错', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    await expect(cloud.uploadDictToCloud()).rejects.toThrow('还没有词典');
    await importDictPack(makePack(), 'dk.pwdict');
    await cloud.uploadDictToCloud(undefined, 64);
    files.delete('u1/dict/part-001');
    await expect(cloud.downloadDictFromCloud()).rejects.toThrow('不完整');
  });

  it('服务器拒绝写入（行级安全）时给出中文提示', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    expect(cloud.cloudErrorText({ message: 'new row violates row-level security policy' })).toContain('没有权限');
  });
});

describe('自动恢复', () => {
  it('新设备登录：自动拉取存档，本机没有词典就从云端恢复', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    await db.vocabBook.add(vocab('apple'));
    await importDictPack(makePack(), 'dk.pwdict');
    await cloud.syncDataWithCloud();
    await cloud.uploadDictToCloud(undefined, 64);

    // 换到“新设备”：本机什么都没有
    await clearAllData();
    await deleteDict();
    const msgs: string[] = [];
    await cloud.autoRestore((m) => msgs.push(m));
    expect((await db.vocabBook.toArray()).map((v) => v.word)).toEqual(['apple']);
    expect(await db.dictEntries.count()).toBe(1);
    expect(msgs.join('\n')).toContain('已从云端恢复「DK」');
  });

  it('本机已有词典：不重复下载；没登录：什么都不做', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    await importDictPack(makePack(), 'dk.pwdict');
    await cloud.uploadDictToCloud(undefined, 64);
    const msgs: string[] = [];
    await cloud.autoRestore((m) => msgs.push(m));
    expect(msgs.some((m) => m.includes('恢复图解词典'))).toBe(false);

    await cloud.signOut();
    files.clear();
    await cloud.autoRestore((m) => msgs.push(m));
    expect(files.size).toBe(0);
  });

  it('同时触发两次只跑一次', async () => {
    await cloud.signIn('a@b.c', 'right-pw');
    const a = cloud.autoRestore(() => {});
    const b = cloud.autoRestore(() => {});
    expect(a).toBe(b);
    await a;
  });
});

describe('设置（AI Key 等）跟着账号走', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('首次：以前填过的 Key（没有修改时间）也会上传；GitHub 令牌不上传', async () => {
    const settings = await import('../src/services/settings');
    await cloud.signIn('a@b.c', 'right-pw');
    settings.applyCloudSettings({ keys: { deepseek: 'sk-old' } }, 0); // 模拟“老设置”：有 Key、没有修改时间
    store.delete('picword.settings.updatedAt');
    settings.updateSettings({ ghToken: 'github_pat_secret' });
    store.delete('picword.settings.updatedAt');

    expect((await cloud.syncDataWithCloud()).settings).toBe('pushed');
    const file = JSON.parse(await files.get('u1/settings.json')!.text());
    expect(file.settings.keys).toEqual({ deepseek: 'sk-old' });
    expect(file.settings.ghToken).toBeUndefined();
    expect(file.updatedAt).toBe(settings.getSettingsUpdatedAt());
    // 再同步一次：两边一样，什么都不做
    expect(await cloud.syncSettingsNow()).toBe('same');
  });

  it('另一台设备改得更新 → 拉取到本机，本机的 GitHub 令牌保留', async () => {
    const settings = await import('../src/services/settings');
    await cloud.signIn('a@b.c', 'right-pw');
    settings.updateSettings({ keys: { deepseek: 'sk-mine' }, ghToken: 'github_pat_local' });
    await cloud.syncSettingsNow();

    const newer = { updatedAt: settings.getSettingsUpdatedAt() + 1000, settings: { keys: { qwen: 'sk-from-phone' }, provider: 'qwen', aiEnabled: true } };
    files.set('u1/settings.json', new Blob([JSON.stringify(newer)]));
    expect(await cloud.syncSettingsNow()).toBe('pulled');
    const s = settings.getSettings();
    expect(s.keys).toEqual({ qwen: 'sk-from-phone' });
    expect(s.provider).toBe('qwen');
    expect(s.ghToken).toBe('github_pat_local');
  });

  it('本机改得更新 → 上传覆盖云端', async () => {
    const settings = await import('../src/services/settings');
    await cloud.signIn('a@b.c', 'right-pw');
    files.set('u1/settings.json', new Blob([JSON.stringify({ updatedAt: 1, settings: { keys: { deepseek: 'old' } } })]));
    settings.updateSettings({ keys: { deepseek: 'sk-new' } });
    expect(await cloud.syncSettingsNow()).toBe('pushed');
    expect(JSON.parse(await files.get('u1/settings.json')!.text()).settings.keys).toEqual({ deepseek: 'sk-new' });
  });

  it('Key 不进可导出的存档文件', async () => {
    const { buildBackup } = await import('../src/services/backup');
    expect(JSON.stringify(await buildBackup())).not.toContain('sk-');
  });
});

describe('AI 关卡存进个人关卡库，跟着账号走', () => {
  it('存进「AI 生成」；内置总库不变；登录后自动同步到账号', async () => {
    const store = new Map<string, string>([['picword.cloud.auth', '{}']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
    const { collectLevel, AI_FOLDER } = await import('../src/services/collections');
    const { SEED_LEVELS } = await import('../src/data/seedLevels');
    const { scheduleCloudSync } = await import('../src/services/cloudConfig');
    await cloud.signIn('a@b.c', 'right-pw');
    const seedCount = SEED_LEVELS.length;
    const level = {
      id: 'ai-test-1', source: 'ai' as const, title: '海边日落', sceneDesc: 'sunset', passCount: 3, fullCount: 5,
      coreWords: [{ word: 'sunset', pos: 'n.', meaning: '日落', relevance: 95 }], advWords: [], weakWords: [], createdAt: 1,
    };
    await collectLevel(level, AI_FOLDER);
    expect((await db.levels.get('ai-test-1'))?.folder).toBe('AI 生成');
    expect(SEED_LEVELS.length).toBe(seedCount);

    scheduleCloudSync(0);
    await vi.waitFor(() => expect(files.has('u1/data.json')).toBe(true));
    const uploaded = JSON.parse(await files.get('u1/data.json')!.text());
    expect(uploaded.data.levels.map((l: { id: string }) => l.id)).toContain('ai-test-1');
  });
});
