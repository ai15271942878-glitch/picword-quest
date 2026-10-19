# -*- coding: utf-8 -*-
"""
种子关卡选图 第 1 步：按场景检索 Openverse 上的 CC0 库存照片，拼成带编号的缩略图对照表供人工挑选。

用法：
  1. 在 scripts/.work/ov_scenes.json 写场景与检索词，如 {"kitchen": ["kitchen cooking", "family cooking kitchen"]}
  2. python find_seed_photos.py            # 全部场景；或 python find_seed_photos.py kitchen
  3. 打开 scripts/.work/sheets/ov_<场景>.jpg 肉眼挑图（注意 rawpixel 部分图片有斜向水印）
  4. 在 scripts/.work/picks.json 写 {"kitchen": 8}，再运行 fetch_seed_photos.py
依赖：Pillow；Openverse 匿名额度 20 次/分钟、200 次/天。
"""
import json, os, sys, io, time, urllib.request, urllib.parse
from PIL import Image, ImageDraw, ImageFont

UA = "PicWordQuest/1.0 (local dev seed builder)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work")
os.makedirs(OUT, exist_ok=True)
BAD = ("logo", "illustration", "vector", "drawing", "painting", "poster", "mockup", "template", "png", "psd", "sticker", "clipart", "isolated")


def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read()
                return data if binary else json.loads(data.decode("utf-8"))
        except Exception as e:  # noqa
            if i == tries - 1:
                print("  ! fail", url[:110], e)
                return None
            time.sleep(2)


def search(q, source, n=20):
    params = {"q": q, "source": source, "page_size": str(n), "aspect_ratio": "wide", "mature": "false"}
    d = get("https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(params))
    out = []
    for r in (d or {}).get("results", []):
        w, h = r.get("width") or 0, r.get("height") or 0
        if w < 1500 or not h or not (1.3 <= w / h <= 1.9):
            continue
        text = (r.get("title") or "") + " " + " ".join(t["name"] for t in r.get("tags") or [])
        if any(b in text.lower() for b in BAD):
            continue
        out.append({
            "id": r["id"], "title": r.get("title"), "w": w, "h": h, "url": r.get("url"),
            "source": r.get("source"), "license": r.get("license"), "license_version": r.get("license_version"),
            "creator": r.get("creator"), "page": r.get("foreign_landing_url"),
            "tags": [t["name"] for t in r.get("tags") or []][:25],
        })
    return out


def sheet(name, cands):
    cols, tw, th = 3, 330, 220
    rows = (len(cands) + cols - 1) // cols
    img = Image.new("RGB", (cols * tw, rows * (th + 22)), (30, 30, 30))
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 15)
    except Exception:
        font = ImageFont.load_default()
    for i, c in enumerate(cands):
        data = get(c["url"], binary=True)
        if not data:
            continue
        try:
            t = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            continue
        c["fetched_w"] = t.width
        t.thumbnail((tw, th))
        x, y = (i % cols) * tw, (i // cols) * (th + 22)
        img.paste(t, (x + (tw - t.width) // 2, y + 22))
        dr.text((x + 6, y + 3), f"#{i} {c['source'][:9]} {c['w']}x{c['h']} {c['license']}", fill=(255, 230, 0), font=font)
    p = os.path.join(OUT, "sheets", f"ov_{name}.jpg")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, quality=80)
    return p


def main():
    scenes = json.load(open(os.path.join(OUT, "ov_scenes.json"), encoding="utf-8"))
    only = sys.argv[1:]
    for name, queries in scenes.items():
        if only and name not in only:
            continue
        seen, cands = set(), []
        for q in queries:
            for src in ("stocksnap,wordpress", "rawpixel"):
                for c in search(q, src):
                    if c["id"] in seen:
                        continue
                    seen.add(c["id"])
                    c["q"] = q
                    cands.append(c)
                time.sleep(3.2)  # stay under 20/min burst
                if len(cands) >= 12:
                    break
            if len(cands) >= 12:
                break
        cands = cands[:12]
        json.dump(cands, open(os.path.join(OUT, f"ov_{name}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        p = sheet(name, cands) if cands else None
        print(f"{name}: {len(cands)} -> {p}")
        for i, c in enumerate(cands):
            print(f"   #{i} [{c['source']}] {(c['title'] or '')[:70]}")


if __name__ == "__main__":
    main()
