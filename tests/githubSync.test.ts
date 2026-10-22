import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_PATH, ghConfigOf, syncDataWithGitHub, syncDictFromGitHub, testGhConnection } from '../src/services/githubSync';
import { buildBackup, clearAllData, importBackup } from '../src/services/backup';
import { deleteDict } from '../src/services/dictionary';
import { db, getSetting, setSetting } from '../src/services/db';
import type { VocabItem } from '../src/types';

const CFG = { token: 'tok', repo: 'me/my-dictionary' };
const DATA_URL = `https://api.github.com/repos/me/my-dictionary/contents/${DATA_PATH}`;

function vocab(word: string): VocabItem {
  return { key: `lv:${word}`, word, pos: 'n.', meaning: word, relevance: 90, tier: 'core', levelId: 'lv', levelTitle: 'L', createdAt: 1, box: 1, due: 0 } as VocabItem;
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await clearAllData();
  await deleteDict();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('ghConfigOf', () => {
  it('仓库名容错：完整网址 / .git 后缀', () => {
    expect(ghConfigOf({ ghToken: ' t ', ghRepo: 'https://github.com/me/repo.git' })).toEqual({ token: 't', repo: 'me/repo' });
  });
  it('缺令牌或仓库格式不对 → null', () => {
    expect(ghConfigOf({ ghToken: '', ghRepo: 'me/repo' })).toBeNull();
    expect(ghConfigOf({ ghToken: 't', ghRepo: 'repo' })).toBeNull();
  });
});

describe('存档同步', () => {
  it('首次同步：云端没有存档 → 直接上传（不带 sha），请求带令牌', async () => {
    await db.vocabBook.add(vocab('apple'));
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(json({}, 201));
    const r = await syncDataWithGitHub(CFG);
    expect(r.pulled).toBeNull();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(DATA_URL);
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.sha).toBeUndefined();
    const uploaded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))));
    expect(uploaded.data.vocabBook.map((v: VocabItem) => v.word)).toEqual(['apple']);
  });

  it('云端已有存档：先合并进本机，再带 sha 上传合并结果', async () => {
    await db.vocabBook.add(vocab('apple'));
    const remote = await buildBackup();
    remote.data.vocabBook = [vocab('banana')];
    fetchMock.mockResolvedValueOnce(json({ sha: 'abc', encoding: 'base64', content: b64(JSON.stringify(remote)) })).mockResolvedValueOnce(json({}, 200));
    const r = await syncDataWithGitHub(CFG);
    expect(r.pulled?.vocab).toBe(1);
    expect((await db.vocabBook.toArray()).map((v) => v.word).sort()).toEqual(['apple', 'banana']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).sha).toBe('abc');
  });

  it('上传时云端刚被别的设备改过（409）→ 重新拉取再传一次', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(json({ sha: 'new', encoding: 'base64', content: b64(JSON.stringify(await buildBackup())) }))
      .mockResolvedValueOnce(json({}, 200));
    await syncDataWithGitHub(CFG);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).sha).toBe('new');
  });

  it('令牌无效 → 明确提示', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(syncDataWithGitHub(CFG)).rejects.toThrow('访问令牌无效');
  });

  it('网络不通 → 提示可能需要代理', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(testGhConnection(CFG)).rejects.toThrow('连不上 GitHub');
  });
});

describe('词典同步', () => {
  it('下载仓库里的词典包并导入，用 raw 格式请求', async () => {
    const header = new TextEncoder().encode(
      JSON.stringify({ name: 'DK', pages: [{ page: 1, offset: 0, length: 2, width: 1, height: 1 }], entries: [{ en: 'apple', zh: '苹果', page: 1 }] }),
    );
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, header.length, true);
    const pack = new Blob([new TextEncoder().encode('PWDICT1\n'), len, header, new Uint8Array([7, 8])]);
    fetchMock.mockResolvedValueOnce(new Response(pack, { status: 200 }));
    const stages: string[] = [];
    const meta = await syncDictFromGitHub(CFG, 'pack/dk.pwdict', (st) => stages.push(st));
    expect(meta).toMatchObject({ name: 'DK', pageCount: 1, entryCount: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/me/my-dictionary/contents/pack/dk.pwdict');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/vnd.github.raw');
    expect(stages).toContain('import');
  });

  it('仓库里没有词典包 → 提示路径', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(syncDictFromGitHub(CFG, 'pack/x.pwdict')).rejects.toThrow('pack/x.pwdict');
  });
});

describe('词典元信息只属于本机', () => {
  it('不进存档；覆盖导入与清空数据都保留它', async () => {
    await setSetting('dict', { name: 'DK', pageCount: 1, entryCount: 1, importedAt: 1 });
    await setSetting('folders', ['A']);
    const backup = await buildBackup();
    expect(backup.data.settings.map((s) => s.key)).toEqual(['folders']);

    backup.data.settings.push({ key: 'dict', value: { name: '别的设备的词典' } });
    await importBackup(JSON.stringify(backup), 'replace');
    expect((await getSetting<{ name: string } | null>('dict', null))?.name).toBe('DK');

    await clearAllData();
    expect((await getSetting<{ name: string } | null>('dict', null))?.name).toBe('DK');
  });
});
