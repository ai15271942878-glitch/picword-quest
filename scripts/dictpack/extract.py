"""从 PDF 页面取出文字行（带位置）：优先用 PDF 自带文字层，没有就用 OCR。

返回的每一行是 dict：{"text": str, "x0", "y0", "x1", "y1"}，坐标是相对页面宽高的 0~1 比例。
"""

import pymupdf

_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR

        _ocr = RapidOCR()
    return _ocr


def text_layer_lines(page):
    w, h = page.rect.width, page.rect.height
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if not text:
                continue
            x0, y0, x1, y1 = line["bbox"]
            out.append({"text": text, "x0": x0 / w, "y0": y0 / h, "x1": x1 / w, "y1": y1 / h})
    return out


def ocr_lines(page, dpi=200):
    pix = page.get_pixmap(dpi=dpi)
    result, _ = _get_ocr()(pix.tobytes("png"))
    out = []
    for box, text, conf in result or []:
        if float(conf) < 0.5:
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        out.append({
            "text": text.strip(),
            "x0": min(xs) / pix.width,
            "y0": min(ys) / pix.height,
            "x1": max(xs) / pix.width,
            "y1": max(ys) / pix.height,
        })
    return out


def page_lines(page, force_ocr=False, dpi=200):
    """文字层少于 5 行就当作扫描页，改用 OCR。返回 (lines, 是否用了 OCR)。"""
    if not force_ocr:
        lines = text_layer_lines(page)
        if len(lines) >= 5:
            return lines, False
    return ocr_lines(page, dpi), True


def render_jpeg(page, width=1200, quality=70):
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
    return pix.tobytes("jpeg", jpg_quality=quality), pix.width, pix.height
