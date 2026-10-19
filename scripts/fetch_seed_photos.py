# -*- coding: utf-8 -*-
"""
种子关卡选图 第 2 步：下载 picks.json 里选中的照片，统一压到 ≤1280px 写入 public/seed/<场景>.jpg，
并把作者 / 许可 / 来源记录到 .work/credits.json（写 seedLevels.ts 的 credit 字段时照抄）。
"""
import json, os, io, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, ".work")
OUT = os.path.join(HERE, "..", "public", "seed")
os.makedirs(OUT, exist_ok=True)

picks = json.load(open(os.path.join(WORK, "picks.json"), encoding="utf-8"))
cred_path = os.path.join(WORK, "credits.json")
credits = json.load(open(cred_path, encoding="utf-8")) if os.path.exists(cred_path) else {}
for name, idx in picks.items():
    c = json.load(open(os.path.join(WORK, f"ov_{name}.json"), encoding="utf-8"))[idx]
    data = urllib.request.urlopen(urllib.request.Request(c["url"], headers={"User-Agent": "PicWordQuest/1.0"}), timeout=60).read()
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if im.width > 1280:
        im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    p = os.path.join(OUT, f"{name}.jpg")
    im.save(p, "JPEG", quality=84, optimize=True, progressive=True)
    credits[name] = {k: c.get(k) for k in ("id", "title", "creator", "license", "license_version", "source", "page", "url")}
    print(f"{name:13s} {im.width}x{im.height} {os.path.getsize(p)//1024:4d}KB  {c['source']}  {c['license']}  by {c.get('creator')}")
json.dump(credits, open(cred_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
