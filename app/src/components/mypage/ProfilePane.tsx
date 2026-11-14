import React, { useMemo, useRef, useState } from 'react';
import { api, money } from '../../lib/api';
import { useApp } from '../../lib/store';
import { sound } from '../../lib/sound';

type Preset = { id: string; name: string; src: string; category: 'poker' | 'ocean' | 'lucky' };

const PRESETS: Preset[] = [
  { id: 'gg-01', name: 'Andrew', src: '/assets/avatars/gg-01.jpg', category: 'poker' },
  { id: 'gg-02', name: 'Barry', src: '/assets/avatars/gg-02.jpg', category: 'poker' },
  { id: 'gg-03', name: 'Billy', src: '/assets/avatars/gg-03.jpg', category: 'poker' },
  { id: 'gg-04', name: 'Brian', src: '/assets/avatars/gg-04.jpg', category: 'poker' },
  { id: 'gg-05', name: 'Danny', src: '/assets/avatars/gg-05.jpg', category: 'poker' },
  { id: 'gg-06', name: 'Elizabeth', src: '/assets/avatars/gg-06.jpg', category: 'poker' },
  { id: 'gg-07', name: 'Jackson', src: '/assets/avatars/gg-07.jpg', category: 'ocean' },
  { id: 'gg-08', name: 'Jacky', src: '/assets/avatars/gg-08.jpg', category: 'ocean' },
  { id: 'gg-09', name: 'Jake', src: '/assets/avatars/gg-09.jpg', category: 'ocean' },
  { id: 'gg-10', name: 'John', src: '/assets/avatars/gg-10.jpg', category: 'ocean' },
  { id: 'gg-11', name: 'Ken', src: '/assets/avatars/gg-11.jpg', category: 'ocean' },
  { id: 'gg-12', name: 'Kitty', src: '/assets/avatars/gg-12.jpg', category: 'ocean' },
  { id: 'gg-13', name: 'Max', src: '/assets/avatars/gg-13.jpg', category: 'ocean' },
  { id: 'gg-14', name: 'Melissa', src: '/assets/avatars/gg-14.jpg', category: 'lucky' },
  { id: 'gg-15', name: 'Oscar', src: '/assets/avatars/gg-15.jpg', category: 'lucky' },
  { id: 'gg-16', name: 'Paul', src: '/assets/avatars/gg-16.jpg', category: 'lucky' },
  { id: 'gg-17', name: 'Robert', src: '/assets/avatars/gg-17.jpg', category: 'lucky' },
  { id: 'gg-18', name: 'Sean', src: '/assets/avatars/gg-18.jpg', category: 'lucky' },
  { id: 'gg-19', name: 'Shana', src: '/assets/avatars/gg-19.jpg', category: 'lucky' },
  { id: 'gg-20', name: 'Tina', src: '/assets/avatars/gg-20.jpg', category: 'lucky' },
];

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
  { key: 'poker', label: 'Poker Players' },
  { key: 'ocean', label: 'Ocean Characters' },
  { key: 'lucky', label: 'Lucky Charm' },
  { key: 'gods', label: 'Gaming Gods' },
  { key: 'historic', label: 'Historic Figures' },
];

export function ProfilePane() {
  const { user, refreshUser, toast } = useApp();
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<string>(user?.avatar || '');
  const [nick, setNick] = useState(user?.nick || '');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    if (category === 'all') return PRESETS;
    if (category === 'custom' || category === 'gods' || category === 'historic') return [];
    return PRESETS.filter((p) => p.category === category);
  }, [category]);

  const dirty = (selected || '') !== (user?.avatar || '') || nick.trim() !== (user?.nick || '');

  const pickUpload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast({ kind: 'error', title: 'Image too large', body: 'Use an image under 2 MB.' }); return; }
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    setSelected(src);
    setCategory('custom');
  };

  const apply = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      if ((selected || '') !== (user?.avatar || '')) await api.setAvatar(selected);
      if (nick.trim() && nick.trim() !== user?.nick) await api.setNick(nick.trim());
      await refreshUser();
      sound.play('coin', { volume: .5 });
      toast({ kind: 'success', title: 'Profile saved' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not save', body: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mpp">
      <div className="mpp-head">
        <div className="mpp-portrait">
          <img src={selected && selected.startsWith('/assets/avatars') ? selected : (user?.avatar || '/assets/avatars/gg-05.jpg')} alt="" />
          <span className="mpp-vip">{user?.vip_level ?? 0}</span>
        </div>
        <div className="mpp-nick">
          <label htmlFor="mpp-nick">Nickname</label>
          <div className="mpp-nick-row">
            <input id="mpp-nick" value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} />
            <span className="mpp-lock" aria-hidden="true">🔒</span>
          </div>
          <small>ID {user?.login} · {money(user?.balance ?? 0)} balance</small>
        </div>
      </div>

      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickUpload(e.target.files?.[0])} />

      <div className="mpp-chips" role="tablist" aria-label="Avatar category">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={category === c.key} className={'mpp-chip' + (category === c.key ? ' on' : '')} onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
        <button type="button" className="mpp-chip mpp-chip-more" aria-label="More categories">›</button>
      </div>

      <div className="mpp-grid">
        <button type="button" className="mpp-cell mpp-upload" onClick={() => file.current?.click()}>
          <span className="mpp-upload-ico" aria-hidden="true">
            <svg width="30" height="26" viewBox="0 0 30 26" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 8h5l2-3h10l2 3h5v14H3z" /><circle cx="15" cy="15" r="5" /></svg>
          </span>
          <span>Upload Image</span>
        </button>
        {shown.map((p) => (
          <button key={p.id} type="button" className={'mpp-cell' + (selected === p.src ? ' on' : '')} onClick={() => setSelected(p.src)} aria-label={p.name} aria-pressed={selected === p.src}>
            <img src={p.src} alt="" loading="lazy" />
            <span>{p.name}</span>
          </button>
        ))}
        {!shown.length && category !== 'custom' && (
          <div className="mpp-empty">No avatars in this category yet.</div>
        )}
        {category === 'custom' && !shown.length && (
          <div className="mpp-empty">Upload an image to use it as your avatar.</div>
        )}
      </div>

      <div className="mpp-foot">
        <button type="button" className="mpp-apply" disabled={!dirty || busy} onClick={apply}>{busy ? 'Saving…' : 'Apply'}</button>
      </div>
    </div>
  );
}
