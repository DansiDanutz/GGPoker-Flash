// SPDX-License-Identifier: AGPL-3.0-only
// A plugin PR adds its reviewed browser/server implementation and a Play Money route here.
// Registration ships with source; it never imports code supplied through the submission API.
export const CONTRIBUTOR_PLUGINS = Object.freeze([
  { id: 'rake-lab', name: 'Rake Lab', summary: 'Explore percentage rake, caps and no-flop/no-rake with a free virtual-chip calculator.', version: '1.0.0', prNumber: 224, playPath: '/rake-lab' },
]);

export function validatePluginRegistration(plugin) {
  if (!/^[a-z][a-z0-9-]{2,60}$/.test(plugin.id) || !Number.isSafeInteger(plugin.prNumber) || plugin.prNumber < 1
    || !/^\d+\.\d+\.\d+$/.test(plugin.version) || typeof plugin.name !== 'string' || plugin.name.length < 2 || plugin.name.length > 120
    || typeof plugin.summary !== 'string' || !plugin.summary || plugin.summary.length > 240
    || !/^\/(?:[a-z0-9-]+\/?)*(?:\?[a-zA-Z0-9_=&%-]+)?$/.test(plugin.playPath)) throw new Error('Invalid contributor plugin registration.');
  return plugin;
}
CONTRIBUTOR_PLUGINS.forEach(validatePluginRegistration);
