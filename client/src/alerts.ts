// Getting the attention of players who looked away: a short beep and the tab title.

import { useEffect } from "react";
import { getPrefs } from "./prefs";
import { SITE } from "./site";

let audio: AudioContext | null = null;

/** Browsers only allow sound after the user has clicked or pressed something on the page. */
function unlockAudio(): void {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      audio = null;
    }
  }
  void audio?.resume();
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

/** A short, soft two-tone beep. Silent when muted, or if the browser doesn't allow sound yet. */
export function playNewScrambleSound(): void {
  if (!getPrefs().sound || !audio || audio.state !== "running") return;
  const start = audio.currentTime;
  [660, 880].forEach((frequency, i) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.15, start + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.12 + 0.11);
    oscillator.connect(gain).connect(audio!.destination);
    oscillator.start(start + i * 0.12);
    oscillator.stop(start + i * 0.12 + 0.12);
  });
}

const BASE_TITLE = SITE.name;

/**
 * When a new scramble appears (a new `scrambleKey`) that you have to solve:
 * beep, and put "New scramble" in the tab title until you look at the tab.
 */
export function useNewScrambleAlert(scrambleKey: string | null, youMustSolve: boolean): void {
  useEffect(() => {
    if (!scrambleKey || !youMustSolve) return;
    playNewScrambleSound();
    if (document.hidden) {
      document.title = `New scramble | ${BASE_TITLE}`;
    }
  }, [scrambleKey, youMustSolve]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) document.title = BASE_TITLE;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.title = BASE_TITLE;
    };
  }, []);
}
