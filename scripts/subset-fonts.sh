#!/usr/bin/env bash
# Rebuilds app/fonts/*.woff2 from the geist package's variable fonts, keeping
# only what the product sets: Latin and Latin-1, general punctuation, currency
# (₹ € £), arrows, the maths signs in use, and the OpenType features the
# stylesheet asks for (ss01, cv11, tabular figures) plus standard shaping.
# Characters outside this (e.g. a client's name in another script) fall back
# to the system font. Run after upgrading geist. Needs fonttools + brotli:
#   python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools brotli
set -euo pipefail
PYFTSUBSET="${PYFTSUBSET:-.venv-fonts/bin/pyftsubset}"
UNICODES="U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20A0-20CF,U+2122,U+2190-21FF,U+2212,U+2248,U+2260,U+2264-2265,U+2318,U+FEFF,U+FFFD"
FEATURES="kern,liga,calt,ccmp,locl,mark,mkmk,case,tnum,pnum,ss01,cv11,frac,numr,dnom,sups,subs"
SRC=node_modules/geist/dist/fonts
for f in geist-sans/Geist-Variable geist-mono/GeistMono-Variable; do
  "$PYFTSUBSET" "$SRC/$f.woff2" --unicodes="$UNICODES" --layout-features="$FEATURES" \
    --flavor=woff2 --output-file="app/fonts/$(basename "$f").woff2"
done
cp node_modules/geist/LICENSE.txt app/fonts/LICENSE.txt
