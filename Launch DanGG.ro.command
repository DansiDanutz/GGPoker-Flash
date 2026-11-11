#!/bin/bash
# Launches the locally built GGPoker clone desktop app.
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE
open "$HOME/Applications/DanGG.ro.app"
