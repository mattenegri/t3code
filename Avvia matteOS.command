#!/bin/zsh
set -eu
cd -- "${0:A:h}"
runtime="./.matteos-tools/bin/node"
if [[ ! -x "$runtime" ]]; then runtime="node"; fi
if ! "$runtime" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 26 ? 0 : 1)' 2>/dev/null; then
  print -u2 'Per avviare matteOS installa Node.js 26.12.1.'
  exit 1
fi
if [[ ! -f apps/web/dist/index.html || ! -f apps/server/dist/bin.mjs ]]; then
  print -u2 'Esegui la build indicata in docs/user/matteos.md prima del primo avvio.'
  exit 1
fi
exec "$runtime" apps/server/dist/bin.mjs --host 127.0.0.1 --base-dir "$HOME/.matteos/t3"
