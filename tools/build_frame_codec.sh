#!/bin/sh
set -eu
TASK=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$TASK"
mkdir -p dist/codec
cp /usr/lib/x86_64-linux-gnu/libjpeg.so.62 dist/codec/libjpeg.so.62
cp /usr/share/doc/libjpeg62-turbo/copyright dist/codec/COPYRIGHT.libjpeg-turbo
gcc -shared -fPIC -O3 -I/usr/include/node native/jpeg_frame.c -o dist/jpeg_frame.node -ljpeg -Wl,-rpath,'$ORIGIN/codec'
readelf --version-info dist/jpeg_frame.node
