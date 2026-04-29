'use client';
/**
 * SS4 Chess League — Sound System
 * Uses Web Audio API to synthesise all sounds programmatically.
 * Zero external dependencies, zero audio files.
 *
 * Sounds:
 *   move     – short soft click (piece landing)
 *   capture  – slightly harder click with thud
 *   check    – sharp ping warning
 *   castle   – two-piece double click
 *   promote  – rising chime
 *   win      – triumphant ascending chord
 *   loss     – descending minor chord
 *   draw     – neutral resolution
 *   tick     – subtle clock tick (last 10s)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'win' | 'loss' | 'draw' | 'tick';

// ── Synthesis helpers ────────────────────────────────────────────────────────

function playTone(
  ctx: AudioContext,
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  gainPeak: number,
  gainEnd: number = 0,
) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type      = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(gainEnd, 0.0001),
    startTime + duration,
  );

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playNoise(
  ctx: AudioContext,
  startTime: number,
  duration: number,
  gainPeak: number,
  filterFreq: number = 4000,
) {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer     = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data       = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type            = 'highpass';
  filter.frequency.value = filterFreq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(startTime);
}

// ── Individual sound generators ──────────────────────────────────────────────

const sounds: Record<SoundName, (ctx: AudioContext) => void> = {
  move(ctx) {
    const t = ctx.currentTime;
    playNoise(ctx, t, 0.06, 0.15, 2500);
    playTone(ctx, 220, 'sine', t, 0.08, 0.04);
  },

  capture(ctx) {
    const t = ctx.currentTime;
    playNoise(ctx, t, 0.1, 0.3, 1500);
    playTone(ctx, 160, 'triangle', t, 0.12, 0.08);
    playTone(ctx, 120, 'sine', t + 0.02, 0.1, 0.06);
  },

  check(ctx) {
    const t = ctx.currentTime;
    playTone(ctx, 880, 'square', t,        0.08, 0.12);
    playTone(ctx, 660, 'square', t + 0.09, 0.08, 0.10);
  },

  castle(ctx) {
    const t = ctx.currentTime;
    playNoise(ctx, t,        0.05, 0.12, 3000);
    playNoise(ctx, t + 0.07, 0.05, 0.12, 3000);
  },

  promote(ctx) {
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      playTone(ctx, freq, 'sine', t + i * 0.09, 0.15, 0.18, 0.001);
    });
  },

  win(ctx) {
    const t = ctx.currentTime;
    // Major chord arpeggio + sustain
    const chord = [523, 659, 784]; // C E G
    chord.forEach((freq, i) => {
      playTone(ctx, freq, 'sine', t + i * 0.08, 0.8, 0.22, 0.001);
    });
    // Top note
    playTone(ctx, 1047, 'sine', t + 0.25, 1.0, 0.28, 0.001);
  },

  loss(ctx) {
    const t = ctx.currentTime;
    // Descending minor phrase
    const notes = [523, 466, 392, 349]; // C B♭ G F
    notes.forEach((freq, i) => {
      playTone(ctx, freq, 'sine', t + i * 0.15, 0.45, 0.15, 0.001);
    });
  },

  draw(ctx) {
    const t = ctx.currentTime;
    // Unresolved suspended chord
    playTone(ctx, 523, 'sine', t,      0.6, 0.15, 0.001); // C
    playTone(ctx, 622, 'sine', t + 0.1, 0.6, 0.12, 0.001); // D#
    playTone(ctx, 698, 'sine', t + 0.2, 0.6, 0.10, 0.001); // F
  },

  tick(ctx) {
    const t = ctx.currentTime;
    playTone(ctx, 1200, 'square', t, 0.025, 0.08);
  },
};

// ── Hook ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ss4_sound_enabled';

export function useSound() {
  const ctxRef     = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  // Lazily create AudioContext on first interaction
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { ctxRef.current?.close(); };
  }, []);

  const play = useCallback((name: SoundName) => {
    if (!enabled) return;
    try {
      const ctx = getCtx();
      sounds[name]?.(ctx);
    } catch (e) {
      // AudioContext errors are non-fatal
      console.warn('[sound]', e);
    }
  }, [enabled, getCtx]);

  const toggle = useCallback(() => setEnabled(v => !v), []);

  return { play, enabled, toggle };
}