/**
 * audioNotify.js — lightweight audio + TTS notification utility
 * Uses Web Audio API (no external files needed) + Web Speech API for voice
 */

// ── Tone generator ─────────────────────────────────────────────────────────
const ctx = () => {
  if (!window._audioCtx) window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._audioCtx;
};

const beep = (freq, duration, type = 'sine', volume = 0.4) => {
  try {
    const ac  = ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + duration);
  } catch {}
};

// ── Named sounds ───────────────────────────────────────────────────────────
export const playNewOrderSound = () => {
  beep(880, 0.12); setTimeout(() => beep(1100, 0.15), 120);
};

export const playOrderAcceptedSound = () => {
  beep(660, 0.1); setTimeout(() => beep(880, 0.1), 110); setTimeout(() => beep(1100, 0.18), 220);
};

export const playOrderReadySound = () => {
  // Three rising tones — attention-grabbing
  beep(523, 0.15); setTimeout(() => beep(659, 0.15), 160);
  setTimeout(() => beep(784, 0.15), 320); setTimeout(() => beep(1047, 0.25), 480);
};

// ── Voice announcement ─────────────────────────────────────────────────────
export const announceReady = ({ tokenNumber, tableNumber }) => {
  if (!window.speechSynthesis) return;
  const table = tableNumber ? `Table ${tableNumber}` : 'counter';
  const msg = new SpeechSynthesisUtterance(
    `Token number ${tokenNumber}, ${table}, your order is ready.`
  );
  msg.rate  = 0.9;
  msg.pitch = 1;
  msg.volume = 1;
  // prefer a clear English voice
  const voices = window.speechSynthesis.getVoices();
  const eng = voices.find(v => v.lang.startsWith('en') && !v.localService === false) || voices[0];
  if (eng) msg.voice = eng;
  window.speechSynthesis.cancel(); // stop any previous
  window.speechSynthesis.speak(msg);
};
