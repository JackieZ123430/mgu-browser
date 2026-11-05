#!/bin/sh
set -eu
TASK=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$TASK/dist"
gcc -shared -fPIC -O2 -Wall -Wextra -DNAPI_VERSION=3 -I/usr/include/node "$TASK/native/peer_uid.c" -o "$TASK/dist/peer_uid.node"
gcc -static -O2 -Wall -Wextra "$TASK/native/backend_launch.c" -o "$TASK/dist/backend-launch"
gcc -static -O2 -Wall -Wextra "$TASK/native/browser_launch.c" -o "$TASK/dist/browser-launch"
readelf -V "$TASK/dist/peer_uid.node"
node -e "const p=require('$TASK/dist/peer_uid.node');console.log('SO_PEERCRED addon loaded:',typeof p.peerUid);try{p.peerUid(-1)}catch(e){console.log('Invalid fd safely rejected')}"
