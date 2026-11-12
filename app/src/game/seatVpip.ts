/** VPIP for a seat's nick; own keys only, so nicks like `__proto__` never leak objects. */
export function vpipOf(map: Record<string, unknown>, nick: string): number {
  const v = Object.hasOwn(map, nick) ? map[nick] : 0;
  return typeof v === 'number' ? v : 0;
}
