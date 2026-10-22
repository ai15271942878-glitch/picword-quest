"""把一页上的文字行组合成词条：中文 / 拼音 / 英文 竖排的标签 → {en, zh, py, box}。"""

import re
import unicodedata

INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w", ""]
FINALS = [
    "iang", "iong", "uang", "ueng", "ang", "eng", "ing", "ong", "ian", "iao", "uai", "uan", "van", "ai", "ei", "ao", "ou",
    "an", "en", "in", "un", "vn", "er", "ia", "ie", "iu", "ua", "uo", "ui", "ue", "ve", "a", "o", "e", "i", "u", "v",
]
SYLLABLES = {i + f for i in INITIALS for f in FINALS}

CJK = re.compile(r"[㐀-鿿]")
SKIP = re.compile(r"公众号|学习必备|资料库|^\d+$|zh[oō]ngw[eé]n|english$", re.I)


def plain(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("ü", "v")


def is_pinyin(text):
    """带声调符号的一定是拼音；否则看能否完整切分成拼音音节（OCR 会丢声调）。"""
    if any(c in text for c in "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"):
        return True
    s = re.sub(r"[^a-z]", "", plain(text))
    if not s:
        return False
    ok = [True] + [False] * len(s)
    for i in range(len(s)):
        if ok[i]:
            for n in range(1, min(7, len(s) - i + 1)):
                if s[i:i + n] in SYLLABLES:
                    ok[i + n] = True
    return ok[len(s)]


def _overlap_x(a, b):
    inter = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    return inter / max(1e-6, min(a["x1"] - a["x0"], b["x1"] - b["x0"]))


def blocks_of(lines):
    """竖向相邻、水平重叠的行归为同一个标签块。"""
    lines = sorted(lines, key=lambda l: (l["y0"], l["x0"]))
    blocks = []
    for ln in lines:
        h = ln["y1"] - ln["y0"]
        best = None
        for b in blocks:
            last = b[-1]
            gap = ln["y0"] - last["y1"]
            if -0.5 * h <= gap <= 1.0 * h and _overlap_x(ln, last) > 0.3 and len(b) < 4:
                best = b
        if best is not None:
            best.append(ln)
        else:
            blocks.append([ln])
    return blocks


def clean_en(s):
    s = re.sub(r"\s+", " ", s).strip(" .,;:·•")
    return s.lower() if s.isupper() and len(s) > 3 else s


def entries_of(lines):
    out = []
    for b in blocks_of([l for l in lines if not SKIP.search(l["text"])]):
        zh = "".join(l["text"] for l in b if CJK.search(l["text"])).strip()
        latin = [l["text"] for l in b if not CJK.search(l["text"])]
        if len(latin) >= 2:
            # 标签固定是“中文、拼音、英文”竖排：最后一行是英文，前面的是拼音（OCR 认错拼音也不影响）
            en, py = [latin[-1]], latin[:-1]
        else:
            py = [t for t in latin if is_pinyin(t)]
            en = [t for t in latin if t not in py]
        if not en or not zh:
            continue
        word = clean_en(" ".join(en))
        if not re.fullmatch(r"[A-Za-z][A-Za-z '\-/().]{1,48}", word):
            continue
        x0 = min(l["x0"] for l in b)
        y0 = min(l["y0"] for l in b)
        x1 = max(l["x1"] for l in b)
        y1 = max(l["y1"] for l in b)
        pad = 0.006
        out.append({
            "en": word,
            "zh": zh,
            "py": " ".join(py) or None,
            "box": [round(max(0, x0 - pad), 4), round(max(0, y0 - pad), 4), round(x1 - x0 + 2 * pad, 4), round(y1 - y0 + 2 * pad, 4)],
        })
    return out


def page_title(lines):
    """页眉：页面顶部 7% 内最长的一行（如“外表 WAIBIAO · APPEARANCE”）。"""
    top = [l for l in lines if l["y1"] < 0.07 and not SKIP.search(l["text"])]
    return max(top, key=lambda l: len(l["text"]))["text"] if top else None
