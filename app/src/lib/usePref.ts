import { useEffect, useRef, useState } from 'react';
import { subscribePrefs } from './prefsSync';

/** A stored preference that re-reads itself whenever one of `keys` changes in any window. */
export function usePref<T>(read: () => T, keys: readonly string[]): T {
  const [value, setValue] = useState<T>(read);
  const readRef = useRef(read);
  readRef.current = read;
  const keyList = keys.join('\n');
  useEffect(() => subscribePrefs(keyList.split('\n'), () => setValue(readRef.current())), [keyList]);
  return value;
}
