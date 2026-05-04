'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'win' | 'loss' | 'draw' | 'tick';

function playTone(ctx: AudioContext, frequency: number, type: OscillatorType, startTime: number, duration: number, gainPeak: number, gainEnd: number = 0) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type; osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.0001), startTime + duration);
  osc.start(startTime); osc.stop(startTime + duration + 0.01);
}

function playNoise(ctx: AudioContext, startTime: number, duration: number, gainPeak: number, filterFreq: number = 4000) {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  source.start(startTime);
}

const sounds: Record<SoundName, (ctx: AudioContext) => void> = {
  move(ctx)    { const t = ctx.currentTime; playNoise(ctx, t, 0.06, 0.15, 2500); playTone(ctx, 220, 'sine', t, 0.08, 0.04); },
  capture(ctx) { const t = ctx.currentTime; playNoise(ctx, t, 0.1, 0.3, 1500); playTone(ctx, 160, 'triangle', t, 0.12, 0.08); playTone(ctx, 120, 'sine', t + 0.02, 0.1, 0.06); },
  check(ctx)   { const t = ctx.currentTime; playTone(ctx, 880, 'square', t, 0.08, 0.12); playTone(ctx, 660, 'square', t + 0.09, 0.08, 0.10); },
  castle(ctx)  { const t = ctx.currentTime; playNoise(ctx, t, 0.05, 0.12, 3000); playNoise(ctx, t + 0.07, 0.05, 0.12, 3000); },
  promote(ctx) { const t = ctx.currentTime; [523,659,784,1047].forEach((f,i) => playTone(ctx, f, 'sine', t + i*0.09, 0.15, 0.18, 0.001)); },
  win(ctx)     { const t = ctx.currentTime; [523,659,784].forEach((f,i) => playTone(ctx, f, 'sine', t + i*0.08, 0.8, 0.22, 0.001)); playTone(ctx, 1047, 'sine', t + 0.25, 1.0, 0.28, 0.001); },
  loss(ctx)    { const t = ctx.currentTime; [523,466,392,349].forEach((f,i) => playTone(ctx, f, 'sine', t + i*0.15, 0.45, 0.15, 0.001)); },
  draw(ctx)    { const t = ctx.currentTime; playTone(ctx, 523, 'sine', t, 0.6, 0.15, 0.001); playTone(ctx, 622, 'sine', t+0.1, 0.6, 0.12, 0.001); playTone(ctx, 698, 'sine', t+0.2, 0.6, 0.10, 0.001); },
  tick(ctx)    { playTone(ctx, 1200, 'square', ctx.currentTime, 0.025, 0.08); },
};

const STORAGE_KEY = 'ss4_sound_enabled';

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  // ── KEY FIX: store enabled in a ref so play() always reads current value ──
  // Without this, play() captures enabled in its closure. When enabled changes,
  // play is recreated, then playRef.current is updated one render later via
  // useEffect — leaving a gap where the old (wrong) play is still active.
  // With enabledRef, play() has no closure over enabled at all; it reads the
  // ref at call time, so toggling is instantaneous with zero render-cycle delay.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  useEffect(() => { return () => { ctxRef.current?.close(); }; }, []);

  // play is now STABLE (getCtx is the only dep) — it reads enabledRef at call
  // time so there is never a stale enabled value regardless of when it's called.
  const play = useCallback((name: SoundName) => {
    if (!enabledRef.current) return;
    try { const ctx = getCtx(); sounds[name]?.(ctx); }
    catch (e) { console.warn('[sound]', e); }
  }, [getCtx]); // enabled intentionally removed — handled by ref above

  const toggle = useCallback(() => setEnabled(v => !v), []);

  return { play, enabled, toggle };
}