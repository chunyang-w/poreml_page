#!/usr/bin/env python3
"""Build web-sized media for the PoreML page from the final_cut assets.

Usage: python3 scripts/build_media.py [--src DIR] [--paper DIR] [--only sim|rollout|film|figs]

Writes into public/media/ and public/data/media.json (the manifest the page reads).
Needs ffmpeg, cwebp and pdftoppm on PATH.
"""

import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "media"
DATA = ROOT / "public" / "data"
DEFAULT_SRC = Path("/Users/chunyang/projects/sponge/assets/final_cut 2")

MODELS = ["truth", "unet", "fno", "p3d", "transolver", "abupt"]
TESTS = {"in_distribution_push": "indist", "geo_shift_push": "geoshift", "scale_up_push": "scaleup"}
CELL_RE = re.compile(r"^(?:(big)|c(\d)r(\d))_(?:drain|trap|gdl|fill)_(.+?)_(\d{4})_([\dx]+)_M([\d.]+)_th(\d+)")


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def family_of(tag):
    # "sphere256" -> sphere, "gdl_ct_20" -> gdl_ct_20, "bent128" -> bent
    return re.sub(r"\d+$", "", tag) if not tag.startswith("gdl_ct") else tag


def build_sim(src):
    cells = {}
    jobs = []
    for mp4 in sorted((src / "assets" / "set1_simulation").glob("*/cells/*.mp4")):
        campaign = mp4.parent.parent.name
        m = CELL_RE.match(mp4.stem)
        if not m:
            print("skip", mp4.name)
            continue
        big, col, row, tag, rid, size, M, th = m.groups()
        key = "big" if big else f"c{col}r{row}"
        dst = OUT / "sim" / campaign / f"{key}.mp4"
        poster = dst.with_suffix(".webp")
        dst.parent.mkdir(parents=True, exist_ok=True)
        width = 960 if big else 640
        nframes = int(
            subprocess.check_output(
                ["ffprobe", "-v", "error", "-select_streams", "v", "-count_packets",
                 "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(mp4)]
            ).decode().strip().rstrip(",")
        )
        cells.setdefault(campaign, []).append(
            {
                "key": key,
                "col": None if big else int(col),
                "row": None if big else int(row),
                "family": family_of(tag),
                "run": rid,
                "size": size,
                "M": float(M),
                "theta": int(th),
                "frames": nframes,
                "src": f"media/sim/{campaign}/{key}.mp4",
                "poster": f"media/sim/{campaign}/{key}.webp",
            }
        )
        jobs.append((mp4, dst, poster, width, nframes))

    def enc(job):
        mp4, dst, poster, width, nframes = job
        run(["ffmpeg", "-y", "-i", str(mp4), "-vf", f"scale={width}:-2:flags=lanczos", "-c:v", "libx264",
             "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(dst)])
        tmp = poster.with_suffix(".png")
        run(["ffmpeg", "-y", "-i", str(mp4), "-vf", f"select=eq(n\\,{int(nframes * 0.7)}),scale={width}:-2",
             "-frames:v", "1", str(tmp)])
        run(["cwebp", "-q", "78", str(tmp), "-o", str(poster)])
        tmp.unlink()
        print("sim", dst.relative_to(OUT))

    with ThreadPoolExecutor(6) as ex:
        list(ex.map(enc, jobs))
    return cells


def build_rollout(src):
    cases = {}
    jobs = []
    for test_dir, test in TESTS.items():
        for frames_root in sorted((src / "assets" / "set2_prediction" / test_dir).glob("*/frames/*")):
            campaign = frames_root.parent.parent.name
            case = frames_root.name
            truth = sorted((frames_root / "truth").glob("*.png"))
            steps = [int(p.stem.split("_")[1]) for p in truth]
            cases.setdefault(test, {})[campaign] = {
                "case": case,
                "n": len(truth),
                "lbm_steps": steps,
                "base": f"media/rollout/{test}/{campaign}",
            }
            for model in MODELS:
                for i, p in enumerate(sorted((frames_root / model).glob("*.png"))):
                    dst = OUT / "rollout" / test / campaign / model / f"{i:02d}.webp"
                    jobs.append((p, dst))

    def enc(job):
        p, dst = job
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            run(["cwebp", "-q", "72", "-resize", "640", "0", "-m", "4", str(p), "-o", str(dst)])

    with ThreadPoolExecutor(11) as ex:
        list(ex.map(enc, jobs))
    print("rollout frames", len(jobs))
    return cases


def build_film(src):
    dst = OUT / "film" / "poreml_final_cut.mp4"
    dst.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-i", str(src / "poreml_final_cut.mp4"), "-vf", "scale=1920:-2:flags=lanczos",
         "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-an", str(dst)])
    run(["ffmpeg", "-y", "-ss", "2", "-i", str(src / "poreml_final_cut.mp4"), "-frames:v", "1",
         "-vf", "scale=1600:-2", str(dst.with_suffix(".png"))])
    run(["cwebp", "-q", "80", str(dst.with_suffix(".png")), "-o", str(dst.with_suffix(".webp"))])
    dst.with_suffix(".png").unlink()
    print("film", dst.stat().st_size // 1_000_000, "MB")


def trim_whitespace(png, pad=12):
    from PIL import Image, ImageChops

    im = Image.open(png).convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 8 else 0)
    box = diff.getbbox()
    if box:
        l, t, r, b = box
        im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))).save(png)


def build_figs(paper):
    out = OUT / "figs"
    out.mkdir(parents=True, exist_ok=True)
    for name in ["main_workflow", "main_run_cases", "main_ganglion_dynamics", "main_geo", "val_lenormand",
                 "val_laplace", "val_capillary_rise", "capillary_micromodel_drainage"]:
        pdf = paper / "figs" / f"{name}.pdf"
        if not pdf.exists():
            continue
        tmp = out / name
        run(["pdftoppm", "-png", "-r", "220", "-singlefile", str(pdf), str(tmp)])
        trim_whitespace(Path(str(tmp) + ".png"))
        run(["cwebp", "-q", "85", "-resize", "2000", "0", str(tmp) + ".png", "-o", str(out / f"{name}.webp")])
        Path(str(tmp) + ".png").unlink()
        print("fig", name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--paper", type=Path)
    ap.add_argument("--only")
    a = ap.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    manifest_path = DATA / "media.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if a.only in (None, "sim"):
        manifest["sim"] = build_sim(a.src)
    if a.only in (None, "rollout"):
        manifest["rollout"] = build_rollout(a.src)
    if a.only in (None, "film"):
        build_film(a.src)
    if a.only in (None, "figs") and a.paper:
        build_figs(a.paper)
    manifest_path.write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
