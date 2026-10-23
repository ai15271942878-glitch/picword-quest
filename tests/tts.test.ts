import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let native = false;
let englishSupported = true;
const speakNative = vi.fn(async () => {});
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native } }));
vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    isLanguageSupported: async () => ({ supported: englishSupported }),
    speak: speakNative,
    stop: async () => {},
  },
}));

const played: string[] = [];
let onlineWorks = true;
class FakeAudio {
  onerror: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    played.push(this.src);
    return onlineWorks ? Promise.resolve() : Promise.reject(new Error('network'));
  }
  pause() {}
}

async function load(source?: 'online' | 'system') {
  vi.resetModules();
  const tts = await import('../src/services/tts');
  if (source) (await import('../src/services/settings')).updateSettings({ ttsSource: source });
  return tts;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const youdao = (w: string) => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w)}&type=2`;

beforeEach(() => {
  played.length = 0;
  speakNative.mockClear();
  onlineWorks = true;
  englishSupported = true;
  vi.stubGlobal('window', {});
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('发音', () => {
  it('默认：有道真人发音（App 里也一样），不用系统语音', async () => {
    native = true;
    const tts = await load();
    expect(tts.ttsSupported()).toBe(true);
    tts.speak('sheep');
    await flush();
    expect(played).toEqual([youdao('sheep')]);
    expect(speakNative).not.toHaveBeenCalled();
  });

  it('有道加载失败（没网等）→ 自动改用系统语音', async () => {
    native = true;
    onlineWorks = false;
    const tts = await load();
    tts.speak('sheep');
    await flush();
    await flush();
    expect(speakNative).toHaveBeenCalledWith(expect.objectContaining({ text: 'sheep', lang: 'en-US' }));
  });

  it('设置选“系统语音”：App 里直接用系统朗读', async () => {
    native = true;
    const tts = await load('system');
    tts.speak('ice cream');
    await flush();
    expect(speakNative).toHaveBeenCalledWith(expect.objectContaining({ text: 'ice cream' }));
    expect(played).toEqual([]);
  });

  it('选“系统语音”但手机没有英语语音 → 仍退回有道', async () => {
    native = true;
    englishSupported = false;
    const tts = await load('system');
    tts.speak('ice cream');
    await flush();
    expect(speakNative).not.toHaveBeenCalled();
    expect(played).toEqual([youdao('ice cream')]);
  });

  it('浏览器没有语音合成：设置页不显示浏览器语音选项', async () => {
    native = false;
    const tts = await load('system');
    expect(tts.webSpeechSupported()).toBe(false);
    tts.speak('apple');
    expect(played).toEqual([youdao('apple')]);
  });
});
