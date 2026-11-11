# Extracted client assets

This folder is intentionally **not committed**. The clone's artwork, sounds and fonts are extracted
from the copy of the GGPoker desktop client installed on this Mac (Adobe AIR app, `IronDesktop.swf`).
They remain the property of their respective owners and are only used for local
reverse-engineering/interoperability.

Regenerate everything with:

```bash
bash tools/setup_assets.sh
```

That script expects the client to have been launched at least once so its data exists under:

```
~/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets
```

It decodes the Stage3D ATF textures, slices the lobby sprite atlas, copies the client's MP3s and fonts,
and crops the header/tab chrome from a 1200×961 screenshot of the running client
(`research/screens/lobby_1200.png`).

Without assets the app still runs, but header art, sounds and table textures will be missing.
