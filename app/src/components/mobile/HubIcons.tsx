import React from 'react';
import type { HubIconName } from '../../lib/accountHub';

/** Line icons for the phone My Page hub: 24-unit grid, 1.8 stroke, currentColor. */
const PATHS: Record<HubIconName, React.ReactNode> = {
  messages: <><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" /></>,
  history: <><path d="M4 19V9M10 19V5M16 19v-7M21 19H3" /></>,
  propbet: <><path d="M7 4h10l-1.5 7a3.5 3.5 0 0 1-7 0Z" /><path d="M12 14.5V18M8 20h8" /></>,
  friends: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6v.5" /><path d="M12 16.8v.2" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16 14.5h2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></>,
  verify: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3" /></>,
  notes: <><path d="M5 4h10l4 4v12H5Z" /><path d="M15 4v4h4M8.5 12h7M8.5 15.5h5" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></>,
  missions: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
};

export function HubIcon({ name, size = 24 }: { name: HubIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
