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
class FakeAudio {
  constructor(public src: string) {}
  play() {
    played.push(this.src);
    return Promise.resolve();
  }
  pause() {}
}

async function loadTts() {
  vi.resetModules();
  return import('../src/services/tts');
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  played.length = 0;
  speakNative.mockClear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('发音', () => {
  it('安卓 App：用系统语音朗读（美式英语）', async () => {
    native = true;
    englishSupported = true;
    const tts = await loadTts();
    expect(tts.ttsSupported()).toBe(true);
    tts.speak('sheep');
    await flush();
    expect(speakNative).toHaveBeenCalledWith(expect.objectContaining({ text: 'sheep', lang: 'en-US' }));
    expect(played).toEqual([]);
  });

  it('安卓 App：系统没有英语语音 → 有道在线发音', async () => {
    native = true;
    englishSupported = false;
    const tts = await loadTts();
    tts.speak('ice cream');
    await flush();
    expect(speakNative).not.toHaveBeenCalled();
    expect(played).toEqual(['https://dict.youdao.com/dictvoice?audio=ice%20cream&type=2']);
  });

  it('浏览器没有语音合成 → 有道在线发音；设置页不显示浏览器语音选项', async () => {
    native = false;
    const tts = await loadTts();
    expect(tts.webSpeechSupported()).toBe(false);
    tts.speak('apple');
    expect(played).toEqual(['https://dict.youdao.com/dictvoice?audio=apple&type=2']);
  });
});
