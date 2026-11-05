/** 16-bit PCM WAV, mixed down to mono. WAV is accepted by every speech and cloning API. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const { length, sampleRate, numberOfChannels } = buffer;
  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i]! += data[i]! / numberOfChannels;
  }
  const out = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  out.setUint32(4, 36 + length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]!));
    out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/** Decodes a browser recording (WebM/Opus or MP4/AAC) and re-encodes it as a WAV file. */
export async function recordingToWav(blob: Blob, name: string, sampleRate = 44_100): Promise<File> {
  const ctx = new AudioContext({ sampleRate });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return new File([encodeWav(decoded)], name.endsWith('.wav') ? name : `${name}.wav`, { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}

export function recorderAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m));
}
