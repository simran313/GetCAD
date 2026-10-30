"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice messages (Phase 15): the browser's own recorder, in the format the
 * device makes best (WebM/Opus on Android and Chrome, MP4/AAC on iPhone and
 * Safari). Tap to start; send or bin it; stops by itself after five minutes.
 * The microphone is released as soon as recording ends.
 */
const MAX_SECONDS = 5 * 60;
const FORMATS: [string, string, string][] = [
  ["audio/webm;codecs=opus", "audio/webm", "webm"],
  ["audio/mp4", "audio/mp4", "m4a"],
  ["audio/ogg;codecs=opus", "audio/ogg", "ogg"],
];

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useVoiceRecorder(onRecorded: (file: File, seconds: number) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(false);
  const started = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const done = useRef(onRecorded);
  done.current = onRecorded;

  const release = useCallback(() => {
    window.clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    setRecording(false);
  }, []);

  const stop = useCallback((send: boolean) => {
    keep.current = send;
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    if (recorder.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const format = FORMATS.find(([mime]) => MediaRecorder.isTypeSupported(mime));
    const r = new MediaRecorder(stream, format ? { mimeType: format[0] } : undefined);
    const [, type, ext] = format ?? [r.mimeType, r.mimeType.split(";")[0] || "audio/webm", r.mimeType.includes("mp4") ? "m4a" : "webm"];
    chunks.current = [];
    keep.current = false;
    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    r.onstop = () => {
      const secs = Math.round((Date.now() - started.current) / 1000);
      release();
      if (!keep.current || chunks.current.length === 0 || secs < 1) return;
      const blob = new Blob(chunks.current, { type });
      done.current(new File([blob], `voice-${Date.now()}.${ext}`, { type }), secs);
    };
    recorder.current = r;
    started.current = Date.now();
    setSeconds(0);
    setRecording(true);
    r.start(250);
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop(true);
    }, 250);
  }, [release, stop]);

  // Leaving the chat mid-recording drops it and frees the microphone.
  useEffect(() => () => {
    keep.current = false;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    window.clearInterval(timer.current);
  }, []);

  return { recording, seconds, start, stop };
}

/** "0:07", "1:42" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
