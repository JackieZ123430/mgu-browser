#!/bin/sh
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for file in "$BASE"/backend/*.js "$BASE"/network/*.js "$BASE"/runtime/*.js; do /usr/bin/node --check "$file"; done
/usr/bin/node -e 'const b=process.argv[1],p=require(b+"/backend/peer_uid.node"),j=require(b+"/backend/jpeg_frame.node");if(typeof p.peerUid!=="function"||typeof j.decode!=="function")process.exit(1);console.log("Native Node/N-API modules loaded");' "$BASE"
/usr/bin/node "$BASE/runtime/check.js"
