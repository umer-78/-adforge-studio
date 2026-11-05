'use client';

import type { PlayerRef } from '@remotion/player';
import { create } from 'zustand';

/**
 * The playhead lives outside the editor store: it changes every frame during playback,
 * and only the few components that draw it should re-render.
 */
export const usePlayhead = create<{ frame: number; playing: boolean; loop: boolean; muted: boolean }>()(() => ({
  frame: 0,
  playing: false,
  loop: false,
  muted: false,
}));

let ref: PlayerRef | null = null;

export const player = {
  attach(r: PlayerRef | null) {
    ref = r;
  },
  get frame() {
    return usePlayhead.getState().frame;
  },
  seek(frame: number) {
    const f = Math.max(0, Math.round(frame));
    usePlayhead.setState({ frame: f });
    ref?.seekTo(f);
  },
  step(delta: number) {
    player.seek(usePlayhead.getState().frame + delta);
  },
  toggle() {
    if (!ref) return;
    if (ref.isPlaying()) ref.pause();
    else ref.play();
  },
  pause() {
    ref?.pause();
  },
  setMuted(muted: boolean) {
    usePlayhead.setState({ muted });
    if (muted) ref?.mute();
    else ref?.unmute();
  },
  setLoop(loop: boolean) {
    usePlayhead.setState({ loop });
  },
  fullscreen() {
    ref?.requestFullscreen();
  },
};
