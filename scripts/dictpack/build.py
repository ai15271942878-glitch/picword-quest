"""把 PDF 图解词典转换成 PicWord Quest 可导入的 .pwdict 词典包。

用法（多个 PDF 按给出的顺序合并，页码连续编号）：
    pip install pymupdf rapidocr-onnxruntime
    python scripts/dictpack/build.py dict-01.pdf dict-02.pdf -o mydict.pwdict --name "英汉图解词典"

可选：
    --width 1200     整页图宽度（像素）
    --quality 70     JPEG 质量
    --ocr            强制 OCR（文字层有乱码时用）
    --ocr-dpi 200    OCR 时的渲染分辨率
    --review out.tsv 输出词条清单，便于人工检查

.pwdict 格式见 src/services/dictionary.ts。词典内容受版权保护时，生成的文件只供自己使用，不要提交到仓库。
"""

import argparse
import json
import struct
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import page_lines, render_jpeg  # noqa: E402
from group import entries_of, page_title  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--width", type=int, default=1200)
    ap.add_argument("--quality", type=int, default=70)
    ap.add_argument("--ocr", action="store_true")
    ap.add_argument("--ocr-dpi", type=int, default=200)
    ap.add_argument("--review", default=None)
    args = ap.parse_args()

    pages, entries, blobs = [], [], []
    offset = 0
    page_no = 0
    ocr_pages = 0
    for path in args.pdfs:
        doc = pymupdf.open(path)
        for page in doc:
            page_no += 1
            lines, used_ocr = page_lines(page, force_ocr=args.ocr, dpi=args.ocr_dpi)
            ocr_pages += used_ocr
            found = entries_of(lines)
            if not found:
                continue  # 封面、目录、纯文字页：没有词条就不收录
            jpg, w, h = render_jpeg(page, args.width, args.quality)
            pages.append({"page": page_no, "offset": offset, "length": len(jpg), "mime": "image/jpeg",
                          "width": w, "height": h, "title": page_title(lines)})
            blobs.append(jpg)
            offset += len(jpg)
            for e in found:
                entries.append({**e, "page": page_no})
            print(f"{Path(path).name} 第 {page_no} 页：{len(found)} 个词条{'（OCR）' if used_ocr else ''}", file=sys.stderr)
        doc.close()

    header = json.dumps({"name": args.name or Path(args.out).stem, "pages": pages, "entries": entries},
                        ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(args.out, "wb") as f:
        f.write(b"PWDICT1\n")
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        for b in blobs:
            f.write(b)

    if args.review:
        with open(args.review, "w", encoding="utf-8") as f:
            f.write("page\ten\tzh\tpy\n")
            for e in entries:
                f.write(f"{e['page']}\t{e['en']}\t{e['zh']}\t{e['py'] or ''}\n")

    size = Path(args.out).stat().st_size / 1e6
    print(f"完成：{len(pages)} 页、{len(entries)} 个词条、{size:.1f} MB（{ocr_pages} 页用了 OCR）→ {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
