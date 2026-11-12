export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
export const APP_BUILT_AT = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

export function buildLabel(build: string): string {
  if (/^\d{14}$/.test(build)) {
    return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)} ${build.slice(8, 10)}:${build.slice(10, 12)}:${build.slice(12, 14)}`;
  }
  if (/^\d{12}$/.test(build)) {
    return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)} ${build.slice(8, 10)}:${build.slice(10, 12)}`;
  }
  return build;
}

export const APP_VERSION_LABEL = `v${APP_VERSION} · ${buildLabel(APP_BUILD)}`;
