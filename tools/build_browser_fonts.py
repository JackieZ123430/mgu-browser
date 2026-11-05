"""Extend the SDK's Ubuntu atlas with Latin, Greek and Cyrillic characters.

Input TTFs and their license are private local build assets from google/fonts.
No BMW font file is extracted or modified.
"""
from pathlib import Path
import base64, hashlib, json, shutil, zlib
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local/browser-fonts'
SOURCE=OUT/'sources'
CHARS=''.join(chr(c) for c in range(32,0x250))+''.join(chr(c) for c in range(0x370,0x530))+'ẞ°μ│·–—…×±²³€↑↓→←✓✕'

def bake(file,size):
    font=ImageFont.truetype(str(file),size)
    ascent,descent=font.getmetrics();items=[]
    for char in dict.fromkeys(CHARS if size<64 else CHARS[:224]+'ẞ°€'):
        box=font.getbbox(char,anchor='ls');w,h=max(0,box[2]-box[0]),max(0,box[3]-box[1])
        im=Image.new('L',(w,h),0) if w and h else None
        if im is not None:
            ImageDraw.Draw(im).text((-box[0],-box[1]),char,font=font,fill=255,anchor='ls')
            im=im.resize((max(1,round(w*.85)),h),Image.Resampling.LANCZOS)
        items.append((char,im,box,font.getlength(char)*.85))
    width=1024;x=y=row=0;places=[]
    for char,im,box,advance in items:
        if im is None:places.append((0,0));continue
        if x+im.width>width:x=0;y+=row+1;row=0
        places.append((x,y));x+=im.width+1;row=max(row,im.height)
    height=y+row+1
    if height>2048:raise RuntimeError('Atlas exceeds renderer texture budget')
    atlas=Image.new('L',(width,height),0);glyphs={}
    for (char,im,box,advance),(x,y) in zip(items,places):
        if im is not None:atlas.paste(im,(x,y))
        glyphs[ord(char)]=[x,y,im.width if im else 0,im.height if im else 0,round(box[0]*.85),box[1],round(advance,2)]
    return dict(size=size,ascent=ascent,descent=descent,atlasW=width,atlasH=height,alpha=base64.b64encode(zlib.compress(atlas.tobytes(),9)).decode(),glyphs=glyphs)

for family,font,sizes in [('label','Ubuntu-Regular.ttf',[18,24,32,44]),('bold','Ubuntu-Bold.ttf',[24,32,44,64]),('light','Ubuntu-Light.ttf',[32,64])]:
    source=SOURCE/font
    data=dict(family=family,source=font,cacheKey=hashlib.sha256(source.read_bytes()+CHARS.encode()+b'1024-v2').hexdigest(),sizes=[bake(source,size) for size in sizes])
    (OUT/(family+'.json')).write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    print(f'{family}: {len(data["sizes"][0]["glyphs"])} characters, private SDK atlas generated')
for name in ['LICENCE.txt','COPYRIGHT.txt']:shutil.copyfile(SOURCE/name,OUT/('Ubuntu-'+name))
