import { useEffect, useState } from 'react';

/** Same breakpoint as the phone rules in responsive.css. */
export const PHONE_QUERY = '(max-width: 760px)';

/** The phone layout's media query, read once (for code outside React components). */
export const isPhoneLayout = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

/** True while the viewport uses the phone layout; follows rotation and window resizes. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(isPhoneLayout);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
