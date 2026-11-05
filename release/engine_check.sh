#!/bin/sh
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test "$(stat -c '%u:%a' "$BASE/engine/chrome-sandbox")" = 0:4755
/usr/bin/node -e 'const c=require("child_process"),r=c.spawnSync(process.argv[1]+"/engine/chromium",["--version"],{uid:65534,gid:65534,encoding:"utf8",timeout:15000});process.stdout.write(r.stdout||"");process.stderr.write(r.stderr||"");if(r.status!==0)process.exit(1);' "$BASE"
