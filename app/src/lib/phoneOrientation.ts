/** Use physical screen orientation so an open keyboard never blocks a portrait login form. */
export function needsPortrait(screen: { width: number; height: number; orientation?: { type: string } }, coarsePointer: boolean): boolean {
  return coarsePointer && Math.min(screen.width, screen.height) <= 760
    && (screen.orientation ? screen.orientation.type.startsWith('landscape') : screen.width > screen.height);
}
