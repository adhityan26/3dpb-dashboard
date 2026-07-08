"""
preprocess.py — Silhouette extraction from input image.

Converts a grayscale/color image into a clean binary mask representing
the shadow silhouette region (the region that blocks light).

Saves:
  output/processed_mask.png  — binary mask (255 = shadow, 0 = transparent)
  output/contour_preview.png — debug image with extracted contours drawn
"""

import cv2
import numpy as np
import os

# ─── PARAMETERS ──────────────────────────────────────────────────────────────
INPUT_IMAGE        = "input/joyboy.jpg"
OUTPUT_MASK        = "output/processed_mask.png"
OUTPUT_CONTOUR     = "output/contour_preview.png"

# Resize target: the silhouette is mapped onto a virtual wall plane of this
# physical size (mm).  We work in normalized [0,1] coords here; the physical
# mapping happens in generate_shadow_casing.py.
TARGET_SIZE_PX     = 512          # resize before processing

# Thresholding
USE_OTSU           = True         # True → automatic Otsu; False → THRESH_VALUE
THRESH_VALUE       = 128          # used only when USE_OTSU is False
INVERT_MASK        = True         # True → dark foreground becomes shadow region

# Morphological cleanup
MORPH_CLOSE_ITER   = 2            # iterations of closing (fill small holes)
MORPH_OPEN_ITER    = 1            # iterations of opening  (remove noise)
MORPH_KERNEL_SIZE  = 5            # kernel size for morphological ops

# Contour filtering
MIN_CONTOUR_AREA   = 200          # ignore tiny contours (pixels²)
CONTOUR_APPROX_EPS = 0.004        # fraction of arc length for DP simplification

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def load_and_gray(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Cannot open image: {path}")
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def binarize(gray: np.ndarray, use_otsu: bool, thresh_val: int,
             invert: bool) -> np.ndarray:
    flags = cv2.THRESH_BINARY
    if invert:
        flags = cv2.THRESH_BINARY_INV
    if use_otsu:
        flags |= cv2.THRESH_OTSU
        _, binary = cv2.threshold(gray, 0, 255, flags)
    else:
        _, binary = cv2.threshold(gray, thresh_val, 255, flags)
    return binary


def morphological_cleanup(binary: np.ndarray, kernel_size: int,
                           close_iter: int, open_iter: int) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                  (kernel_size, kernel_size))
    out = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k, iterations=close_iter)
    out = cv2.morphologyEx(out,    cv2.MORPH_OPEN,  k, iterations=open_iter)
    return out


def extract_contours(mask: np.ndarray, min_area: float,
                     approx_eps: float) -> list[np.ndarray]:
    """Return simplified contours sorted by area (largest first)."""
    raw, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in raw:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        peri = cv2.arcLength(c, True)
        simplified = cv2.approxPolyDP(c, approx_eps * peri, True)
        out.append(simplified)
    out.sort(key=cv2.contourArea, reverse=True)
    return out


def save_contour_preview(mask: np.ndarray, contours: list[np.ndarray],
                         path: str) -> None:
    preview = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    cv2.drawContours(preview, contours, -1, (0, 200, 0), 2)
    for i, c in enumerate(contours):
        M = cv2.moments(c)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            cv2.putText(preview, str(i), (cx, cy),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    cv2.imwrite(path, preview)


# ─── MAIN ────────────────────────────────────────────────────────────────────

def run(
    input_image: str   = INPUT_IMAGE,
    output_mask: str   = OUTPUT_MASK,
    output_contour: str = OUTPUT_CONTOUR,
    target_size: int   = TARGET_SIZE_PX,
    use_otsu: bool     = USE_OTSU,
    thresh_value: int  = THRESH_VALUE,
    invert_mask: bool  = INVERT_MASK,
    morph_close: int   = MORPH_CLOSE_ITER,
    morph_open: int    = MORPH_OPEN_ITER,
    morph_kernel: int  = MORPH_KERNEL_SIZE,
    min_area: float    = MIN_CONTOUR_AREA,
    approx_eps: float  = CONTOUR_APPROX_EPS,
) -> dict:
    os.makedirs(os.path.dirname(output_mask),    exist_ok=True)
    os.makedirs(os.path.dirname(output_contour), exist_ok=True)

    print(f"[preprocess] loading {input_image}")
    gray = load_and_gray(input_image)

    # Resize to a standard square canvas (preserving aspect via padding)
    h, w = gray.shape
    scale = target_size / max(h, w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(gray, (nw, nh), interpolation=cv2.INTER_AREA)
    # Pad to square
    canvas = np.zeros((target_size, target_size), dtype=np.uint8)
    dy, dx = (target_size - nh) // 2, (target_size - nw) // 2
    canvas[dy:dy+nh, dx:dx+nw] = resized

    print("[preprocess] binarizing …")
    binary = binarize(canvas, use_otsu, thresh_value, invert_mask)

    print("[preprocess] morphological cleanup …")
    clean = morphological_cleanup(binary, morph_kernel, morph_close, morph_open)

    print("[preprocess] extracting contours …")
    contours = extract_contours(clean, min_area, approx_eps)
    print(f"[preprocess] found {len(contours)} contour(s)")

    cv2.imwrite(output_mask, clean)
    save_contour_preview(clean, contours, output_contour)
    print(f"[preprocess] saved mask      → {output_mask}")
    print(f"[preprocess] saved preview   → {output_contour}")

    return {
        "mask":      clean,
        "contours":  contours,
        "canvas_hw": (target_size, target_size),
    }


if __name__ == "__main__":
    result = run()
    print(f"[preprocess] largest contour points: {len(result['contours'][0])}")
