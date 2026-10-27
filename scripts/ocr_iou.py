#!/usr/bin/env python3
"""Read the per-step IoU printed on each rollout panel frame into public/data/iou.json.

The panels (2416x1530, 2x3 grid) print "IoU 0.xx" in the top-right corner of every model tile.
Usage: python3 scripts/ocr_iou.py [--src DIR]
"""

import argparse
import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path("/Users/chunyang/projects/sponge/assets/final_cut 2")
TESTS = {"in_distribution_push": "indist", "geo_shift_push": "geoshift", "scale_up_push": "scaleup"}
# model -> (x, y) of a 200x50 crop around its IoU label
BOXES = {"unet": (1400, 155), "fno": (2200, 155), "p3d": (600, 830), "transolver": (1400, 830), "abupt": (2200, 830)}
NUM = re.compile(r"(\d\.\d\d)")


def read_frame(png, tmpdir):
    out = {}
    for model, (x, y) in BOXES.items():
        crop = Path(tmpdir) / f"{png.parent.parent.name}_{png.stem}_{model}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-vf", f"crop=200:50:{x}:{y}", str(crop)],
                       check=True)
        txt = subprocess.run(["tesseract", str(crop), "-", "--psm", "7"], capture_output=True, text=True).stdout
        m = NUM.search(txt.replace(",", "."))
        out[model] = float(m.group(1)) if m else None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    a = ap.parse_args()
    result = {}
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(8) as ex:
        for test_dir, test in TESTS.items():
            for panel in sorted((a.src / "assets" / "set2_prediction" / test_dir).glob("*/frames/*/panel")):
                campaign = panel.parent.parent.parent.name
                frames = sorted(panel.glob("*.png"))
                rows = list(ex.map(lambda p: read_frame(p, tmp), frames))
                result.setdefault(test, {})[campaign] = {m: [r[m] for r in rows] for m in BOXES}
                missing = sum(v is None for r in rows for v in r.values())
                print(test, campaign, len(rows), "missing", missing)
    (ROOT / "public" / "data" / "iou.json").write_text(json.dumps(result))


if __name__ == "__main__":
    main()
