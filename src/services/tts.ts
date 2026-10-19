// ============================================================
// 美式发音：window.speechSynthesis（Web Speech API），lang = en-US
// 【新增】自动挑选音质最好的英语语音（Edge 的 Natural 神经语音 / Chrome 的 Google US English），
// 也可以在设置里手动指定语音和语速。
// ============================================================

import { getSettings } from './settings';

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}

if (ttsSupported()) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** 所有英语语音（en-US 排前面） */
export function englishVoices(): SpeechSynthesisVoice[] {
  return loadVoices()
    .filter((v) => /^en[-_]/i.test(v.lang))
    .sort((a, b) => rankVoice(b) - rankVoice(a));
}

function rankVoice(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/en[-_]US/i.test(v.lang)) s += 10;
  if (/natural|neural|online/i.test(v.name)) s += 6; // Edge 神经语音
  if (/google us english/i.test(v.name)) s += 5;
  if (/aria|jenny|guy|samantha|ava|allison/i.test(v.name)) s += 3;
  if (v.localService === false) s += 1;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const want = getSettings().ttsVoice;
  const list = englishVoices();
  return (want && list.find((v) => v.voiceURI === want)) || list[0];
}

export function speak(text: string, opts: { rate?: number } = {}) {
  if (!ttsSupported() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = opts.rate ?? getSettings().ttsRate ?? 0.9;
  synth.speak(u);
}
