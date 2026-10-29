# PoreML project page

Project page for **PoreML: A Data-Driven Framework for Learning Multiphase Flow in Porous Media**
([arXiv:2610.10314](https://arxiv.org/abs/2610.10314), [code](https://github.com/PoreML),
[data](https://huggingface.co/datasets/PoreML/PoreML_data)).

A static site: plain HTML, CSS and JavaScript in `public/`, no build step.

## Preview locally

```bash
python3 -m http.server 8765 -d public
```

## Deploy (Cloudflare Workers static assets)

```bash
npx wrangler login     # once
npx wrangler deploy
```

## Regenerating media and data

The page's media and JSON are generated from the supplementary-video assets and the paper source:

```bash
# simulation clips, rollout frames, film, paper figures -> public/media, public/data/media.json
python3 scripts/build_media.py --src "/path/to/final_cut" --paper /path/to/arxiv_src

# solver validation clips from the bob repo -> public/media/val
# (pull demo/ GIFs from the cluster first, e.g. ssh workspace 'cd ~/sponge/bob/demo && tar cf - <gifs>' | tar xf -)
python3 scripts/build_media.py --only val --val /path/to/bob/demo

# per-step IoU printed on each rollout panel -> public/data/iou.json  (needs tesseract)
python3 scripts/ocr_iou.py --src "/path/to/final_cut"

# Table 1 of the paper + per-step transfer curves -> public/data/results.json
python3 scripts/extract_results.py /path/to/arxiv_src/poreml.tex /path/to/exp_collate/output/rollout_metrics.csv
```

Requires `ffmpeg`, `cwebp` and `pdftoppm`.
