from pathlib import Path
import json
import sys
import fitz


JPG = Path("attached_assets/IMG_4126_1787989611392.JPG")
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("attached_assets/Scan_2026-08-29_1787989790250.pdf")
OUT = Path(".agents/outputs") / f"{PDF.stem}-analysis"
OUT.mkdir(parents=True, exist_ok=True)


doc = fitz.open(PDF)
report = {
    "pdf": str(PDF),
    "page_count": doc.page_count,
    "metadata": doc.metadata,
    "pages": [],
}

for index, page in enumerate(doc):
    images = []
    seen_xrefs = set()
    for image in page.get_images(full=True):
        xref = image[0]
        width = image[2]
        height = image[3]
        colorspace = image[5]
        if xref not in seen_xrefs:
            extracted = doc.extract_image(xref)
            extracted_path = OUT / f"embedded-xref-{xref}.{extracted['ext']}"
            extracted_path.write_bytes(extracted["image"])
            seen_xrefs.add(xref)
        else:
            extracted_path = OUT / f"embedded-xref-{xref}.{doc.extract_image(xref)['ext']}"
        images.append(
            {
                "xref": xref,
                "width": width,
                "height": height,
                "pixels": width * height,
                "colorspace": colorspace,
                "embedded_bytes": len(doc.extract_image(xref)["image"]),
                "extension": doc.extract_image(xref)["ext"],
                "extracted_path": str(extracted_path),
            }
        )

    zoom = 2.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    render_path = OUT / f"page-{index + 1}-144dpi.png"
    pix.save(render_path)

    report["pages"].append(
        {
            "page": index + 1,
            "page_rect_points": {
                "width": page.rect.width,
                "height": page.rect.height,
            },
            "rendered_pixels_at_144dpi": {
                "width": pix.width,
                "height": pix.height,
            },
            "images": images,
            "render_path": str(render_path),
        }
    )

report_path = OUT / "report.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
print(f"JPG path: {JPG}")
print(f"PDF report: {report_path}")