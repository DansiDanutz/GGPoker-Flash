import React from 'react';
import { MobileTopBar } from './MobileTopBar';

/** Phone page frame: sticky top bar plus one scrolling column above the tab bar. */
export function MobileShell({ children, title, showBrand }: { children: React.ReactNode; title?: string; showBrand?: boolean }) {
  return (
    <div className="pshell">
      <MobileTopBar title={title} showBrand={showBrand} />
      <div className="pshell-body">{children}</div>
    </div>
  );
}
