const path = require('node:path');
const { existsSync } = require('node:fs');

function profilePath(appData, override) {
  if (override) return override;
  const legacy = path.join(appData, 'GGPoker Clone');
  // Reuse existing databases and sessions; only fresh installations get the new directory name.
  return existsSync(legacy) ? legacy : path.join(appData, 'DanGG');
}

module.exports = { profilePath };
