// ============================================================
// 美式发音：window.speechSynthesis（Web Speech API），lang = en-US
// 【新增】自动挑选音质最好的英语语音（Edge 的 Natural 神经语音 / Chrome 的 Google US English），
// 也可以在设置里手动指定语音和语速。
// 安卓 App（Capacitor）里的网页引擎没有 speechSynthesis：改用手机系统的语音朗读（TextToSpeech 插件），
// 系统没有英语语音或调用失败时，再退回有道在线美式发音（需联网）。
// ============================================================

import { Capacitor } from '@capacitor/core';
import { getSettings } from './settings';

const isNative = () => Capacitor.isNativePlatform();
const hasWebSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** 浏览器语音合成可用（设置页挑选语音时用） */
export const webSpeechSupported = () => hasWebSpeech() && !isNative();

/** 能发音：浏览器语音合成 / 系统语音朗读 / 在线发音（有 Audio 就行） */
export const ttsSupported = () => typeof window !== 'undefined' && (hasWebSpeech() || isNative() || typeof Audio !== 'undefined');

/** 有道在线美式发音（type=2 美音） */
export const onlineVoiceUrl = (text: string) => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`;

let onlineAudio: HTMLAudioElement | null = null;
function speakOnline(text: string) {
  onlineAudio?.pause();
  onlineAudio = new Audio(onlineVoiceUrl(text));
  void onlineAudio.play().catch(() => {
    /* 断网等情况：静默 */
  });
}

/** 系统语音朗读：第一次检查是否支持英语，不支持就记住，以后直接走在线发音 */
let nativeEnglish: boolean | null = null;
async function speakNative(text: string, rate: number) {
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  try {
    if (nativeEnglish === null) nativeEnglish = (await TextToSpeech.isLanguageSupported({ lang: 'en-US' })).supported;
    if (!nativeEnglish) return speakOnline(text);
    await TextToSpeech.stop().catch(() => {});
    await TextToSpeech.speak({ text, lang: 'en-US', rate, category: 'playback' });
  } catch {
    nativeEnglish = false;
    speakOnline(text);
  }
}

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (!hasWebSpeech()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}

if (hasWebSpeech()) {
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
  const rate = opts.rate ?? getSettings().ttsRate ?? 0.9;
  if (isNative()) return void speakNative(text, rate);
  if (!hasWebSpeech()) return speakOnline(text);
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = rate;
  synth.speak(u);
}
