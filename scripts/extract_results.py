#!/usr/bin/env python3
"""Turn the paper's results table (and per-step transfer curves) into public/data/results.json.

Usage: python3 scripts/extract_results.py PORE_ML_TEX [ROLLOUT_METRICS_CSV]

- PORE_ML_TEX: poreml.tex from the arXiv source; Table "tab:all-results" is parsed as is.
- ROLLOUT_METRICS_CSV: exp_collate/output/rollout_metrics.csv (per-step Scale-Up / Geo-Shift curves).
"""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_KEYS = {"UNet3D": "unet", "FNO3D": "fno", "P3D": "p3d", "Transolver++": "transolver", "AB-UPT": "abupt"}
STUDY_KEYS = {"In-distribution": "indist", "Scale-Up": "scaleup", "Geo-Shift": "geoshift"}
COLS = ["p", "phi", "m0", "m1", "m2", "m3"]
CSV_STUDY = {"scale": "scaleup", "shift": "geoshift"}
CSV_METRICS = {"mae@phi": "phi", "iou@phi": "iou", "mae@p": "p"}


def parse_table(tex):
    body = tex.split(r"\label{tab:all-results}")[1].split(r"\bottomrule")[0]
    out = {}
    block = None
    for line in body.splitlines():
        m = re.search(r"\\shortstack\[l\]\{(\w+)\\\\\(([\w-]+)\)\}", line)
        if m:
            block = (m.group(1).lower(), STUDY_KEYS[m.group(2)])
        cells = [c.strip() for c in line.rstrip("\\ ").split("&")]
        if len(cells) != 14 or cells[1] not in MODEL_KEYS:
            continue
        nums = [float(re.sub(r"\\textbf\{(.+?)\}", r"\1", c)) for c in cells[2:]]
        campaign, study = block
        out.setdefault(campaign, {}).setdefault(study, {})[MODEL_KEYS[cells[1]]] = {
            "one": dict(zip(COLS, nums[:6])),
            "h64": dict(zip(COLS, nums[6:])),
        }
    return out


def parse_curves(path):
    curves = {}
    for r in csv.DictReader(open(path)):
        if r["group"] != "overall" or r["metric"] not in CSV_METRICS:
            continue
        d = curves.setdefault(CSV_STUDY[r["study"]], {}).setdefault(r["campaign"], {})
        d = d.setdefault(CSV_METRICS[r["metric"]], {}).setdefault(r["model"], {})
        d[int(r["step"])] = round(float(r["value"]), 5)
    for study in curves.values():
        for camp in study.values():
            for metric in camp.values():
                for model, pts in metric.items():
                    metric[model] = [[s, pts[s]] for s in sorted(pts)]
    return curves


def main():
    tex = Path(sys.argv[1]).read_text()
    result = {"table": parse_table(tex)}
    if len(sys.argv) > 2:
        result["curves"] = parse_curves(sys.argv[2])
    dst = ROOT / "public" / "data" / "results.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(result, separators=(",", ":")))
    n = sum(len(m) for s in result["table"].values() for m in s.values())
    print("rows", n, "->", dst)


if __name__ == "__main__":
    main()
