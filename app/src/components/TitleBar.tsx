import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { useI18n } from '../lib/i18n';

export function Icon({ name, size = 17 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' } as const;
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z" /></svg>;
    case 'chat':
      return <svg {...common}><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" opacity=".9" /></svg>;
    case 'trophy':
      return <svg {...common}><path d="M7 4h10v3a5 5 0 0 1-4 4.9V15h3v2H8v-2h3v-3.1A5 5 0 0 1 7 7V4zM5 5H3v2a3 3 0 0 0 3 3V5zm14 0h2v2a3 3 0 0 1-3 3V5z" /></svg>;
    case 'mail':
      return <svg {...common}><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7L4 7v11h16V7l-8 5z" /></svg>;
    case 'info':
      return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3zm0 4.2L7 7.6v3.4c0 3.4 2.1 6.5 5 7.8 2.9-1.3 5-4.4 5-7.8V7.6l-5-1.4z" /></svg>;
    case 'wifi':
      return <svg {...common}><path d="M12 20l3-4a4 4 0 0 0-6 0l3 4zM5 13l2 2a7 7 0 0 1 10 0l2-2a10 10 0 0 0-14 0zM2 9l2 2a13 13 0 0 1 16 0l2-2A16 16 0 0 0 2 9z" /></svg>;
    case 'gear':
      return <svg {...common}><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4l-2 1 .4 2.2-2 1.7-2-.9-1.8 1.3-.4 2.2h-2.4l-.4-2.2-1.8-1.3-2 .9-2-1.7L4.8 13 3 12l2-1-.4-2.2 2-1.7 2 .9L10.4 6.7 10.8 4.5h2.4l.4 2.2 1.8 1.3 2-.9 2 1.7L19.2 11l2 1z" /></svg>;
    case 'user':
      return <svg {...common}><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.4-8 5.4V22h16v-2.6c0-3-3.6-5.4-8-5.4z" /></svg>;
    case 'close':
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" /></svg>;
    case 'minus':
      return <svg {...common}><path d="M4 11h16v2H4z" /></svg>;
    case 'max':
      return <svg {...common}><path d="M4 4h8v2H6v6H4V4zm16 16h-8v-2h6v-6h2v8z" /></svg>;
    case 'chip':
      return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /></svg>;
    case 'ticket':
      return <svg {...common}><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7zm4 3v6h2V10H7z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

export function TitleBar({ online, onOpenChat, onOpenSettings, onOpenNotifications, unread = 0 }: { online: number; onOpenChat?: () => void; onOpenSettings?: () => void; onOpenNotifications?: () => void; unread?: number }) {
  const { navigate, soundOn, toggleSound } = useApp();
  const { lang, setLang, languages } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  return (
    <div className="titlebar">
      <div className="traffic">
        <button className="r" title="Close" onClick={() => (window as any).ggDesktop?.close()} />
        <button className="y" title="Minimize" onClick={() => (window as any).ggDesktop?.minimize()} />
        <button className="g" title="Zoom" onClick={() => (window as any).ggDesktop?.maximize()} />
      </div>
      <div className="online-pill"><span className="dot" />{online.toLocaleString('en-US')} Online</div>
      <div className="spacer" />
      <div className="title-icons">
        <button className="title-icon" title="Live chat" onClick={() => { sound.play('click'); onOpenChat?.(); }}>
          <Icon name="chat" />
        </button>
        <button className="title-icon" title="Tournaments" onClick={() => navigate('/tournaments')}>
          <Icon name="trophy" />
        </button>
        <button className="title-icon" title="Messages" onClick={() => { onOpenNotifications?.(); }}>
          <Icon name="mail" />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className="title-icon" title="Help & info" onClick={() => navigate('/support')}>
          <Icon name="info" />
        </button>
        <button className="title-icon" title="Responsible gaming" onClick={() => navigate('/settings')}>
          <Icon name="shield" />
        </button>
        <button className="title-icon" title="Connection" onClick={() => navigate('/settings')}>
          <Icon name="wifi" />
        </button>
        <button className="title-icon" title={soundOn ? 'Sound on' : 'Sound off'} onClick={toggleSound} style={{ color: soundOn ? '#9fd8b0' : '#777' }}>
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button className="lang-chip" onClick={() => setLangOpen(true)} title="Language">{lang.toUpperCase()}</button>
        <button className="title-icon" title="Settings" onClick={() => { onOpenSettings?.(); navigate('/settings'); }}>
          <Icon name="gear" />
        </button>
      </div>
      {langOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed' }} onClick={() => setLangOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Language</h3><button className="title-icon" onClick={() => setLangOpen(false)}>✕</button></div>
            <div className="modal-body">
              <div className="lang-grid">
                {languages.map((l) => (
                  <button key={l.code} className={'lang-option' + (l.code === lang ? ' on' : '')} onClick={() => { setLang(l.code); sound.play('click', { volume: .4 }); setLangOpen(false); }}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
