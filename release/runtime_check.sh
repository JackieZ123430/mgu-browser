#!/bin/sh
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for file in "$BASE"/backend/*.js "$BASE"/network/*.js "$BASE"/runtime/*.js; do /usr/bin/node --check "$file"; done
/usr/bin/node -e 'const b=process.argv[1],p=require(b+"/backend/peer_uid.node"),j=require(b+"/backend/jpeg_frame.node");if(typeof p.peerUid!=="function"||typeof j.decode!=="function")process.exit(1);console.log("Native Node/N-API modules loaded");' "$BASE"
/usr/bin/node -e 'const c=require("child_process"),s=require(process.argv[1]+"/runtime/setup").prepare();if(!s.ready){console.log("Waiting for frontend registration");process.exit(0);}for(const unit of ["mgu-browser-backend.service","mgu-browser-wifi.service"]){if(c.spawnSync("systemctl",["is-active",unit]).status!==0)throw Error(unit+" is not active");}' "$BASE"
