const PRESETS = ['Shark', 'Lion', 'Ninja', 'Robot', 'Queen', 'Ace', 'Wolf', 'Rocket'];

function initials(name: string) {
  return (name || '?').replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
}

function hash(name: string) {
  return [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}

/** Generate a local 256×256 PNG preset, so avatars need no remote image host. */
export function presetAvatar(name: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const h = hash(name);
  const hue = h % 360;
  const grad = ctx.createRadialGradient(92, 72, 12, 128, 128, 190);
  grad.addColorStop(0, `hsl(${(hue + 28) % 360} 72% 58%)`);
  grad.addColorStop(0.55, `hsl(${hue} 58% 32%)`);
  grad.addColorStop(1, `hsl(${(hue + 330) % 360} 45% 12%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(206, 42, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff8e8';
  ctx.font = '800 104px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(name), 128, 138);
  return canvas.toDataURL('image/png');
}

export function avatarChoices(): { name: string; src: string }[] {
  return PRESETS.map((name) => ({ name, src: presetAvatar(name) }));
}

/** Center-crop, resize and encode a picked image as a 256×256 PNG. */
export async function fileToAvatar(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image must be under 8 MB');
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, 256, 256);
  bitmap.close?.();
  return canvas.toDataURL('image/png');
}
