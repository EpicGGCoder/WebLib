export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Deterministic hue (0-360) from a string, biased toward warm/library tones. */
export function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  // map into a curated range: 15° (rust) → 55° (amber) plus a few greens/teals
  const palette = [18, 28, 38, 48, 58, 8, 150, 165, 180, 95, 110];
  return palette[h % palette.length];
}

/** Build a CSS gradient for a book cover given a hue. */
export function coverGradient(hue: number): string {
  const h2 = (hue + 18) % 360;
  return `linear-gradient(135deg, oklch(0.42 0.11 ${hue}) 0%, oklch(0.52 0.1 ${h2}) 55%, oklch(0.36 0.09 ${hue}) 100%)`;
}

export function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, "");
}
