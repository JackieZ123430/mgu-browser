# Ubuntu derivative MGU Browser UI

These raster atlases are a format-converted, horizontally adjusted derivative
of Ubuntu Regular, Bold and Light. Their font name is **Ubuntu derivative
MGU Browser UI**. `label`, `bold` and `light` are internal renderer keys.
The original TTFs retain their original names. Neither originals nor atlases
are covered by the project's MIT license: all remain under the included
Ubuntu Font Licence 1.0, with original copyright metadata in COPYRIGHT.txt.

The atlases use the generator in `tools/build_browser_fonts.py`: 85% horizontal
scale, sizes 18–64, Latin/Greek/Cyrillic and the listed UI symbols. The source
fonts are included so these inputs can be rebuilt; no BMW font is included.

## Native CJK supplement

`cjk.json` is a subset raster atlas derived from Noto Sans SC, distributed under
the included `OFL-NotoSansSC.txt` (SIL OFL 1.1), separately from the Ubuntu assets
and the project's MIT code. Rebuild with `python tools/build_browser_cjk.py`
(Pillow and Node required). The script verifies the public source font's SHA-256
before rasterizing it. Normal builds copy the committed atlas without fetching
the font. `cjk-baseline.txt` preserves the glyph repertoire of the pinned public
idrive7-apps kit; translated browser labels add their own glyphs. The generator
keeps the result within the renderer's 1024 by 2048 texture budget.

This atlas serves native controls and supported title glyphs. It is not a font
for Chromium webpages and does not cover the entire Chinese character set.


`cjk-titles.json` is a second, lower-resolution fallback atlas for GB2312 Chinese
titles (plus the baseline and menu glyphs). Regenerate it with
`python tools/build_browser_cjk.py --titles`. The browser uses it only when the
sharp menu atlas lacks a character and the fallback can render the complete
string. It has 6891 glyphs at 14px in a 1024 by 1631 atlas. Rare characters outside
this repertoire remain unsupported by the native atlas.

Webpages use the full Noto Sans SC TTF, independently packaged with the runtime
by `release/browser_fonts.py`. The source URL/hash and OFL license are retained;
the renderer atlases do not supply Chromium's web fonts.
