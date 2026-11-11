import React from 'react';

const GRADS = [
  ['#5a3a1f', '#c79a3a'], ['#1f3f5a', '#3f9ad0'], ['#3a1f4f', '#9a4fd0'],
  ['#1f4a2c', '#45c777'], ['#4a1f28', '#d0455a'], ['#2c2c3a', '#7a86a8'],
  ['#4a3a1f', '#d0a345'], ['#1f4a46', '#3fc7bd'],
];

export function Avatar({ name, src, size = 44 }: { name: string; src?: string; size?: number }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const idx = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length;
  const [a, b] = GRADS[idx];
  const initials = (name || '?').replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      background: `radial-gradient(circle at 32% 25%, ${b}, ${a} 70%)`,
      color: '#151515', fontWeight: 800, fontSize: size * 0.38, letterSpacing: -.5,
      boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.35)', flex: '0 0 auto',
    }}>{initials}</div>
  );
}
