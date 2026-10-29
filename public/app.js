// PoreML project page: dataset explorer, rollout comparison and benchmark charts.

const MODELS = [
  { key: "unet", name: "UNet3D", kind: "voxel" },
  { key: "fno", name: "FNO3D", kind: "voxel" },
  { key: "p3d", name: "P3D", kind: "voxel" },
  { key: "transolver", name: "Transolver++", kind: "point" },
  { key: "abupt", name: "AB-UPT", kind: "point" },
];
const MODEL_NAME = Object.fromEntries(MODELS.map((m) => [m.key, m.name]));
const color = (key) => `var(--m-${key})`;

const CAMPAIGNS = {
  drainage: {
    name: "Primary drainage",
    why: "How injected CO₂ or hydrogen pushes brine out of rock.",
    text: "A non-wetting fluid is driven into rock saturated with the wetting phase and advances pore by pore, pinning at throats and then jumping forward.",
    geo: "Sphere packs, Gaussian blobs, polydisperse grains; µCT Bentheimer, Buff Berea and Castlegate sandstone",
    domain: "128³ and 256³ voxels",
    sweep: "θ 120–150°, M 0.05–1",
    runs: "176 runs, 69,473 frames, 1.05 TB",
    phase: "the invading non-wetting phase",
  },
  trapping: {
    name: "Capillary trapping",
    why: "The mechanism that locks CO₂ in place underground.",
    text: "After the non-wetting phase settles, the wetting phase floods back and pinches it into isolated ganglia that can no longer move.",
    geo: "Sphere packs, Gaussian blobs, polydisperse grains; µCT Bentheimer, Buff Berea and Castlegate sandstone",
    domain: "128³ and 256³ voxels",
    sweep: "θ 120–150°, M 0.05–1",
    runs: "176 runs, 23,040 frames, 390 GB",
    phase: "the non-wetting phase being trapped",
  },
  gdl: {
    name: "GDL water intrusion",
    why: "Why fuel cells flood.",
    text: "Water produced in a fuel cell has to escape through a hydrophobic carbon-fibre layer before it blocks the pathways that supply reactant gas.",
    geo: "Generated fibre mats; µCT carbon paper with 5–40% PTFE",
    domain: "128×128×64 and 256×256×128 voxels",
    sweep: "θ 120–150°, M 1–20",
    runs: "176 runs, 53,654 frames, 1.08 TB",
    phase: "liquid water",
  },
  underfill: {
    name: "Flip-chip underfill",
    why: "How chip packages get filled, and where voids form.",
    text: "Encapsulant wicks into the gap under a chip by capillarity alone, flowing around solder balls. Fronts that close around a ball can trap air.",
    geo: "Parametric gaps varying solder-ball diameter, pitch and gap height",
    domain: "Up to 26×482×476 voxels",
    sweep: "θ 30–50°, M 5–30",
    runs: "32 runs, 12,379 frames, 808 GB",
    phase: "the encapsulant",
  },
};

const FAMILY = {
  sphere: "Sphere pack", poly: "Polydisperse grains", blob: "Gaussian blobs", fiber: "Fibre mat",
  bent: "Bentheimer (µCT)", buff: "Buff Berea (µCT)", castle: "Castlegate (µCT)",
  gdl_ct: "Carbon paper (µCT)", gdl_ct_20: "Carbon paper, 20% PTFE (µCT)", flipchip: "Flip-chip gap",
};

const TESTS = {
  indist: { name: "In-distribution", desc: "Held-out runs drawn from the same mix of generated and micro-CT geometries the models were trained on." },
  geoshift: { name: "Geometry shift", desc: "Models trained only on generated geometries, tested on micro-CT scans of real sandstone and fuel-cell paper." },
  scaleup: { name: "Scale-up", desc: "Models trained on small domains, tested on domains twice as wide (eight times the volume) at the same voxel size." },
};

const METRICS = {
  phi: { name: "Phase φ, MAE", opt: "Phase φ", short: "Phase MAE" },
  p: { name: "Pressure p, MAE", opt: "Pressure p", short: "Pressure MAE" },
  m0: { name: "M₀ volume, relative error", opt: "M₀ volume", short: "Volume error" },
  m1: { name: "M₁ interface area, relative error", opt: "M₁ interface area", short: "Area error" },
  m2: { name: "M₂ mean curvature, relative error", opt: "M₂ mean curvature", short: "Curvature error" },
  m3: { name: "M₃ topology, Euler-characteristic MAE per 10⁵ voxels", opt: "M₃ topology", short: "Topology error" },
};

const ICON_PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>';
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((k) => k !== null && k !== undefined));
  return el;
};
const fmt = (v) => {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return String(+v.toPrecision(3));
};
const caseInfo = (name) => {
  const m = name.match(/^(?:drain|trap|gdl|fill)_(.+?)\d*_(\d{4})_([\dx]+)_M([\d.]+)_th(\d+)/);
  if (!m) return {};
  const size = m[3].includes("x") ? m[3].replace(/x/g, "×") : `${m[3]}³`;
  return { family: FAMILY[m[1]] || m[1], size, M: m[4], theta: m[5] };
};

function tabs(container, items, current, onPick, isDisabled = () => false) {
  container.replaceChildren(
    ...items.map(([key, label]) =>
      h("button", {
        class: "tab", role: "tab", "aria-selected": String(key === current), disabled: isDisabled(key),
        onclick: () => onPick(key),
      }, label),
    ),
  );
}

function setFill(range) {
  const p = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty("--fill", `${p}%`);
}

// Tooltip shared by all charts
const tip = h("div", { class: "tip", role: "status" });
document.body.append(tip);
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const r = tip.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const hideTip = () => tip.classList.remove("on");

const SVG = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
  el.append(...kids.flat().filter(Boolean));
  return el;
};

/* ---------------- Top bar ---------------- */
const topbar = $(".topbar");
addEventListener("scroll", () => topbar.classList.toggle("scrolled", scrollY > 8), { passive: true });

/* ---------------- Copy buttons ---------------- */
document.querySelectorAll(".copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = document.getElementById(btn.dataset.copy).innerText;
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = old), 1400);
    } catch {
      btn.textContent = "Select and copy";
    }
  });
});

if (reduceMotion) document.querySelectorAll("video[autoplay]").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); });

const [media, iou, results] = await Promise.all(
  ["data/media.json", "data/iou.json", "data/results.json"].map((u) => fetch(u).then((r) => r.json())),
);

/* ---------------- Dataset explorer ---------------- */
{
  const tabsEl = $("#sim-tabs"), copyEl = $("#sim-copy"), matrix = $("#sim-matrix");
  const lb = $("#lightbox"), lbVideo = $("#lb-video"), lbScrub = $("#lb-scrub"), lbPlay = $("#lb-play");
  let current = "drainage";

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && !reduceMotion) v.play().catch(() => {});
      else v.pause();
    }
  }, { threshold: 0.15 });

  function render() {
    tabs(tabsEl, Object.entries(CAMPAIGNS).map(([k, c]) => [k, c.name]), current, (k) => { current = k; render(); });
    const c = CAMPAIGNS[current];
    copyEl.replaceChildren(
      h("h3", {}, c.name),
      h("p", { class: "why" }, c.why),
      h("p", {}, c.text),
      h("dl", {},
        h("dt", {}, "Geometry"), h("dd", {}, c.geo),
        h("dt", {}, "Domain"), h("dd", {}, c.domain),
        h("dt", {}, "Sweep"), h("dd", {}, c.sweep),
        h("dt", {}, "Data"), h("dd", {}, c.runs),
      ),
    );

    io.disconnect();
    const cells = media.sim[current];
    const big = cells.find((x) => x.key === "big");
    const colM = [], rowT = [];
    for (const x of cells) if (x.key !== "big") { colM[x.col] = x.M; rowT[x.row] = x.theta; }

    const kids = [h("div")];
    colM.forEach((M, i) => kids.push(h("div", { class: "mx-col", style: `grid-column:${i + 2};grid-row:1` }, h("i", {}, "M"), `= ${M}`)));
    rowT.forEach((t, i) => kids.push(h("div", { class: "mx-row", style: `grid-column:1;grid-row:${i + 2}` }, h("i", {}, "θ"), `= ${t}°`)));
    for (const x of cells) {
      const isBig = x.key === "big";
      const video = h("video", { class: "blend", muted: "", loop: "", playsinline: "", preload: "none", poster: x.poster, src: x.src, "aria-hidden": "true" });
      video.muted = true;
      const label = `${FAMILY[x.family] || x.family}, ${x.size.replace(/x/g, "×")}${x.size.includes("x") ? "" : "³"}`;
      const style = isBig ? "" : `grid-column:${x.col + 2};grid-row:${x.row + 2}`;
      const cell = h("button", {
        class: `cell${isBig ? " big" : ""}`, style,
        "aria-label": `${label}, M ${x.M}, contact angle ${x.theta} degrees. Open larger view.`,
        onclick: () => openLightbox(x),
      }, video,
      h("span", { class: "tag" }, isBig ? [h("b", {}, "Large domain "), `${label}, M = ${x.M}, θ = ${x.theta}°`] : label));
      kids.push(cell);
      io.observe(video);
    }
    matrix.classList.toggle("no-big", !big);
    matrix.replaceChildren(...kids);
  }

  function openLightbox(x) {
    lbVideo.poster = x.poster;
    lbVideo.src = x.src;
    lbVideo.muted = true;
    $("#lb-meta").replaceChildren(
      ...[
        ["Scenario", CAMPAIGNS[current].name],
        ["Geometry", FAMILY[x.family] || x.family],
        ["Domain", x.size.includes("x") ? x.size.replace(/x/g, "×") : `${x.size}³`],
        ["Viscosity ratio M", x.M],
        ["Contact angle θ", `${x.theta}°`],
        ["Run", x.run],
      ].map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, String(v)))),
    );
    lb.showModal();
    if (!reduceMotion) lbVideo.play().catch(() => {});
    syncPlay();
  }
  const syncPlay = () => {
    const paused = lbVideo.paused;
    lbPlay.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    lbPlay.setAttribute("aria-label", paused ? "Play" : "Pause");
  };
  lbVideo.addEventListener("play", syncPlay);
  lbVideo.addEventListener("pause", syncPlay);
  lbVideo.addEventListener("timeupdate", () => {
    if (lbVideo.duration) { lbScrub.value = (lbVideo.currentTime / lbVideo.duration) * 1000; setFill(lbScrub); }
  });
  lbScrub.addEventListener("input", () => {
    lbVideo.pause();
    if (lbVideo.duration) lbVideo.currentTime = (lbScrub.value / 1000) * lbVideo.duration;
    setFill(lbScrub);
  });
  lbPlay.addEventListener("click", () => (lbVideo.paused ? lbVideo.play() : lbVideo.pause()));
  lb.addEventListener("close", () => { lbVideo.pause(); lbVideo.removeAttribute("src"); lbVideo.load(); });
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });

  render();
}

/* ---------------- Rollout comparison ---------------- */
{
  const state = { test: "indist", camp: "drainage", model: "abupt", i: 0, playing: false };
  const cmp = $("#compare"), top = $("#cmp-top"), handle = $("#cmp-handle");
  const imgTruth = $("#cmp-truth"), imgModel = $("#cmp-model");
  const scrub = $("#ro-scrub"), playBtn = $("#ro-play"), stepOut = $("#ro-step");
  const cache = new Map();
  let timer = null;

  const caseData = () => media.rollout[state.test][state.camp];
  const frameUrl = (model, i) => `${caseData().base}/${model}/${String(i).padStart(2, "0")}.webp`;
  const load = (url) => {
    if (!cache.has(url)) {
      const img = new Image();
      img.decoding = "async";
      cache.set(url, new Promise((res) => { img.onload = img.onerror = () => res(url); img.src = url; }));
    }
    return cache.get(url);
  };

  async function preload(model) {
    const n = caseData().n;
    const order = [...Array(n).keys()];
    await Promise.all(order.slice(0, 8).map((i) => load(frameUrl(model, i))));
    order.slice(8).forEach((i) => load(frameUrl(model, i)));
  }

  function renderControls() {
    tabs($("#ro-test"), Object.entries(TESTS).map(([k, t]) => [k, t.name]), state.test, (k) => {
      state.test = k;
      if (!media.rollout[k][state.camp]) state.camp = "drainage";
      reset();
    });
    tabs($("#ro-camp"), Object.entries(CAMPAIGNS).map(([k, c]) => [k, c.name]), state.camp,
      (k) => { state.camp = k; reset(); }, (k) => !media.rollout[state.test][k]);
    $("#ro-test-desc").textContent = TESTS[state.test].desc;

    const fs = $("#ro-models");
    fs.replaceChildren(h("legend", {}, "Compare against"),
      ...MODELS.map((m) =>
        h("label", { class: "model-opt" },
          h("input", { type: "radio", name: "ro-model", value: m.key, checked: m.key === state.model || undefined,
            onchange: () => { state.model = m.key; preload(m.key); showFrame(); drawIou(); } }),
          h("span", { class: "sw", style: `background:${color(m.key)}` }),
          h("span", {}, m.name),
          h("span", { class: "iou", "data-model": m.key }),
        )));
  }

  async function showFrame() {
    const i = state.i;
    const tUrl = frameUrl("truth", i), mUrl = frameUrl(state.model, i);
    cmp.classList.add("loading");
    await Promise.all([load(tUrl), load(mUrl)]);
    if (i !== state.i) return;
    imgTruth.src = tUrl;
    imgModel.src = mUrl;
    cmp.classList.remove("loading");
    $("#cmp-model-label").textContent = MODEL_NAME[state.model];
    cmp.style.setProperty("--swatch", color(state.model));
    scrub.value = i;
    setFill(scrub);
    const d = caseData();
    stepOut.innerHTML = `h = ${i + 1} / ${d.n}<span>LBM step ${d.lbm_steps[i].toLocaleString("en")}</span>`;
    const curve = iou[state.test][state.camp];
    document.querySelectorAll(".model-opt .iou").forEach((el) => {
      el.innerHTML = `<small>IoU</small>${curve[el.dataset.model][i].toFixed(2)}`;
    });
    movePlayhead();
  }

  // IoU chart
  const W = 330, H = 180, P = { l: 34, r: 8, t: 24, b: 24 };
  let xs, ys, playhead;
  function drawIou() {
    const curve = iou[state.test][state.camp];
    const n = caseData().n;
    const all = MODELS.flatMap((m) => curve[m.key]);
    const lo = Math.max(0, Math.floor(Math.min(...all) * 10) / 10);
    xs = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
    ys = (v) => P.t + (1 - (v - lo) / (1 - lo)) * (H - P.t - P.b);
    const ticks = [];
    for (let v = lo; v <= 1.0001; v += lo < 0.5 ? 0.2 : 0.1) ticks.push(+v.toFixed(2));
    const lines = MODELS.filter((m) => m.key !== state.model).concat(MODELS.filter((m) => m.key === state.model)).map((m) => {
      const sel = m.key === state.model;
      const d = curve[m.key].map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join("");
      return s("path", { d, fill: "none", stroke: color(m.key), "stroke-width": sel ? 2.5 : 1.5, opacity: sel ? 1 : 0.4, "stroke-linejoin": "round" });
    });
    playhead = s("line", { y1: P.t, y2: H - P.b, stroke: "var(--ink)", "stroke-width": 1 });
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "IoU of each model against the ground truth over the 64 rollout steps" },
      s("g", { class: "grid" }, ticks.map((t) => s("line", { x1: P.l, x2: W - P.r, y1: ys(t), y2: ys(t), stroke: "var(--rule)" }))),
      s("g", {}, ticks.map((t) => s("text", { x: P.l - 6, y: ys(t) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--ink-3)", "font-family": "var(--sans)" }, t.toFixed(1)))),
      s("text", { x: P.l, y: H - 4, "font-size": 11, fill: "var(--ink-3)", "font-family": "var(--sans)" }, "step 1"),
      s("text", { x: W - P.r, y: H - 4, "font-size": 11, fill: "var(--ink-3)", "text-anchor": "end", "font-family": "var(--sans)" }, `step ${n}`),
      s("text", { x: P.l, y: 10, "font-size": 11, fill: "var(--ink-3)", "font-family": "var(--sans)" }, "IoU vs. ground truth"),
      lines, playhead);
    $("#iou-chart").replaceChildren(svg);
    movePlayhead();
  }
  function movePlayhead() {
    if (!playhead) return;
    const x = xs(state.i);
    playhead.setAttribute("x1", x);
    playhead.setAttribute("x2", x);
  }

  function reset() {
    stop();
    state.i = 0;
    const d = caseData();
    scrub.max = d.n - 1;
    renderControls();
    const info = caseInfo(d.case);
    const start = d.lbm_steps[0], dt = d.lbm_steps[1] - d.lbm_steps[0];
    $("#ro-case").textContent =
      `${CAMPAIGNS[state.camp].name}: ${info.family}, ${info.size} voxels, M = ${info.M}, θ = ${info.theta}°. ` +
      `Blue shows ${CAMPAIGNS[state.camp].phase}. Rollout starts from the true state at LBM step ${(start - dt).toLocaleString("en")}; each step advances ${dt.toLocaleString("en")} LBM steps.`;
    preload("truth");
    preload(state.model);
    drawIou();
    showFrame();
  }

  function stop() {
    state.playing = false;
    clearInterval(timer);
    playBtn.innerHTML = ICON_PLAY;
    playBtn.setAttribute("aria-label", "Play rollout");
  }
  function play() {
    if (state.i >= caseData().n - 1) state.i = 0;
    state.playing = true;
    playBtn.innerHTML = ICON_PAUSE;
    playBtn.setAttribute("aria-label", "Pause rollout");
    timer = setInterval(() => {
      if (state.i >= caseData().n - 1) return stop();
      state.i++;
      showFrame();
    }, 110);
  }
  playBtn.addEventListener("click", () => (state.playing ? stop() : play()));
  scrub.addEventListener("input", () => { stop(); state.i = +scrub.value; showFrame(); });

  // Divider dragging
  const setPos = (pct) => {
    pct = Math.max(0, Math.min(100, pct));
    cmp.style.setProperty("--pos", `${pct}%`);
    handle.setAttribute("aria-valuenow", Math.round(pct));
  };
  let dragging = false;
  const fromEvent = (e) => {
    const r = cmp.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };
  cmp.addEventListener("pointerdown", (e) => { dragging = true; cmp.setPointerCapture(e.pointerId); fromEvent(e); });
  cmp.addEventListener("pointermove", (e) => dragging && fromEvent(e));
  cmp.addEventListener("pointerup", () => (dragging = false));
  cmp.addEventListener("pointercancel", () => (dragging = false));
  handle.addEventListener("keydown", (e) => {
    const now = +handle.getAttribute("aria-valuenow");
    if (e.key === "ArrowLeft") { setPos(now - 5); e.preventDefault(); }
    if (e.key === "ArrowRight") { setPos(now + 5); e.preventDefault(); }
  });

  // Start playing once the viewer scrolls into view
  let autoplayed = false;
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !autoplayed && !reduceMotion) {
      autoplayed = true;
      setTimeout(play, 500);
    }
  }, { threshold: 0.5 }).observe(cmp);

  reset();
}

/* ---------------- Benchmark charts ---------------- */
{
  const T = results.table, C = results.curves;
  const st = { camp: "drainage", study: "indist", metric: "phi", horizon: "h64", lineStudy: "scaleup", lineMetric: "phi" };
  const fCamp = $("#f-camp"), fStudy = $("#f-study"), fMetric = $("#f-metric");
  fCamp.append(...Object.entries(CAMPAIGNS).map(([k, c]) => h("option", { value: k }, c.name)));
  fMetric.append(...Object.entries(METRICS).map(([k, m]) => h("option", { value: k }, m.opt)));

  function syncStudy() {
    const avail = Object.keys(T[st.camp]);
    if (!avail.includes(st.study)) st.study = "indist";
    fStudy.replaceChildren(...Object.entries(TESTS).map(([k, t]) => h("option", { value: k, disabled: !avail.includes(k) || undefined }, t.name)));
    fStudy.value = st.study;
  }
  fCamp.addEventListener("change", () => { st.camp = fCamp.value; render(); });
  fStudy.addEventListener("change", () => { st.study = fStudy.value; render(); });
  fMetric.addEventListener("change", () => { st.metric = fMetric.value; render(); });
  $("#f-horizon").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    st.horizon = b.dataset.h;
    $("#f-horizon").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    render();
  });

  function barChart() {
    const rows = MODELS.map((m) => ({ ...m, v: T[st.camp][st.study][m.key][st.horizon][st.metric] }));
    const vals = rows.map((r) => r.v);
    const pos = vals.filter((v) => v > 0);
    const useLog = pos.length === vals.length && Math.max(...vals) / Math.min(...vals) > 25;
    const best = Math.min(...vals);
    const W = 560, rowH = 40, P = { l: 104, r: 64, t: 6, b: 30 };
    const H = P.t + rows.length * rowH + P.b;
    const max = Math.max(...vals);
    let x, ticks;
    if (useLog) {
      const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...vals)))), hi = Math.pow(10, Math.ceil(Math.log10(max)));
      x = (v) => P.l + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - P.l - P.r);
      ticks = [];
      for (let t = lo; t <= hi * 1.0001; t *= 10) ticks.push(t);
      x.base = lo;
    } else {
      const step = niceStep(max / 4);
      const hi = Math.ceil(max / step) * step;
      x = (v) => P.l + (v / hi) * (W - P.l - P.r);
      ticks = [];
      for (let t = 0; t <= hi + 1e-12; t += step) ticks.push(+t.toPrecision(6));
      x.base = 0;
    }
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${METRICS[st.metric].name} for each model` },
      s("g", { class: "grid" }, ticks.map((t) => s("line", { x1: x(t), x2: x(t), y1: P.t, y2: H - P.b }))),
      s("g", { class: "axis" }, ticks.map((t) => s("text", { x: x(t), y: H - 10, "text-anchor": "middle" }, fmt(t)))),
      rows.map((r, i) => {
        const y = P.t + i * rowH + 9, bh = rowH - 18;
        const x0 = x(x.base), x1 = Math.max(x0 + 2, x(r.v));
        const g = s("g", { class: "bar" },
          s("rect", { x: 0, y: y - 9, width: W, height: rowH, fill: "transparent" }),
          s("text", { x: P.l - 12, y: y + bh / 2 + 4, "text-anchor": "end", "font-weight": r.v === best ? 600 : 400, fill: "var(--ink)" }, r.name),
          s("path", { d: roundedBar(x0, y, x1, bh), fill: color(r.key) }),
          s("text", { x: x1 + 8, y: y + bh / 2 + 4, fill: "var(--ink)", "font-weight": r.v === best ? 600 : 400, style: "font-feature-settings:'tnum'" },
            fmt(r.v) + (r.v === best ? "  lowest" : "")),
        );
        g.addEventListener("pointermove", (e) => showTip(`<b>${r.name}</b> (${r.kind} model)<br>${METRICS[st.metric].name}: ${fmt(r.v)}`, e.clientX, e.clientY));
        g.addEventListener("pointerleave", hideTip);
        return g;
      }),
    );
    $("#bar-chart").replaceChildren(svg);
    $("#bar-title").innerHTML = `${METRICS[st.metric].name}<span>${CAMPAIGNS[st.camp].name}, ${TESTS[st.study].name.toLowerCase()}, ${st.horizon === "one" ? "one-step prediction" : "step 64 of the rollout"}. Lower is better.</span>`;
    $("#bar-note").textContent = useLog ? "Log scale: the values span more than an order of magnitude." : "";
  }

  function lineChart() {
    const transfer = ["scaleup", "geoshift"];
    const study = transfer.includes(st.study) ? st.study : st.lineStudy;
    const camp = C[study][st.camp] ? st.camp : "drainage";
    const metric = st.lineMetric;
    const series = MODELS.map((m) => ({ ...m, pts: C[study][camp][metric][m.key] }));
    const W = 560, H = 300, P = { l: 48, r: 16, t: 34, b: 34 };
    const all = series.flatMap((x) => x.pts.map((p) => p[1]));
    const isIou = metric === "iou";
    const lo = isIou ? Math.floor(Math.min(...all) * 10) / 10 : 0;
    const hi = isIou ? 1 : Math.max(...all);
    const step = niceStep((hi - lo) / 4);
    const top = isIou ? 1 : Math.ceil(hi / step) * step;
    const x = (t) => P.l + ((t - 1) / 63) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - (v - lo) / (top - lo)) * (H - P.t - P.b);
    const yt = [];
    for (let t = lo; t <= top + 1e-9; t += step) yt.push(+t.toPrecision(6));
    const xt = [1, 16, 32, 48, 64];
    const cross = s("line", { y1: P.t, y2: H - P.b, stroke: "var(--ink-3)", "stroke-width": 1, opacity: 0 });
    const legend = series.map((m, i) => s("g", { transform: `translate(${P.l + i * 100},8)` },
      s("circle", { cx: 5, cy: 6, r: 5, fill: color(m.key) }),
      s("text", { x: 15, y: 10, fill: "var(--ink-2)" }, m.name)));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${isIou ? "IoU" : "Phase error"} along the rollout for each model` },
      legend,
      s("g", { class: "grid" }, yt.map((t) => s("line", { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t) }))),
      s("g", { class: "axis" },
        yt.map((t) => s("text", { x: P.l - 8, y: y(t) + 4, "text-anchor": "end" }, fmt(t))),
        xt.map((t) => s("text", { x: x(t), y: H - 12, "text-anchor": "middle" }, t)),
        s("text", { x: W - P.r, y: H - 12, "text-anchor": "end" }, "")),
      s("text", { x: (P.l + W - P.r) / 2, y: H, "text-anchor": "middle", fill: "var(--ink-3)", "font-size": 11 }, "Rollout step"),
      cross,
      series.map((m) => s("g", {},
        s("path", { d: m.pts.map((p, i) => `${i ? "L" : "M"}${x(p[0])},${y(p[1])}`).join(""), fill: "none", stroke: color(m.key), "stroke-width": 2, "stroke-linejoin": "round" }),
        m.pts.map((p) => s("circle", { cx: x(p[0]), cy: y(p[1]), r: 4, fill: color(m.key), stroke: "var(--surface)", "stroke-width": 2 })),
      )),
    );
    const hit = s("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" });
    svg.append(hit);
    const steps = series[0].pts.map((p) => p[0]);
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W;
      const k = steps.reduce((best, t, i) => (Math.abs(x(t) - sx) < Math.abs(x(steps[best]) - sx) ? i : best), 0);
      cross.setAttribute("x1", x(steps[k])); cross.setAttribute("x2", x(steps[k])); cross.setAttribute("opacity", 1);
      const rows = series.map((m) => [m, m.pts[k][1]]).sort((a, b) => (isIou ? b[1] - a[1] : a[1] - b[1]));
      showTip(`<b>Step ${steps[k]}</b>` + rows.map(([m, v]) => `<div class="row"><i style="background:${color(m.key)}"></i><span>${m.name}</span><span>${fmt(v)}</span></div>`).join(""), e.clientX, e.clientY);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("opacity", 0); hideTip(); });

    const seg = (opts, cur, onPick) => h("span", { class: "seg", role: "radiogroup" }, ...opts.map(([k, label]) =>
      h("button", { role: "radio", "aria-checked": String(k === cur), onclick: () => onPick(k) }, label)));
    const controls = h("div", { class: "chart-filters", style: "margin-bottom:10px" },
      seg([["scaleup", "Scale-up"], ["geoshift", "Geometry shift"]], study, (k) => { st.lineStudy = k; if (transfer.includes(st.study)) { st.study = k; syncStudy(); barChart(); } lineChart(); }),
      seg([["phi", "Phase MAE"], ["iou", "IoU"]], metric, (k) => { st.lineMetric = k; lineChart(); }),
    );
    $("#line-chart").replaceChildren(controls, svg);
    $("#line-title").innerHTML = `Over the rollout<span>${CAMPAIGNS[camp].name}, ${TESTS[study].name.toLowerCase()} test. ${isIou ? "Higher" : "Lower"} is better.</span>`;
    $("#line-note").textContent = camp !== st.camp ? "Transfer tests cover drainage, trapping and GDL; showing drainage." : "";
  }

  function table() {
    const cols = Object.keys(METRICS);
    const head = h("tr", {}, h("th", {}, "Scenario, test"), h("th", {}, "Model"),
      ...cols.map((c) => h("th", {}, `${METRICS[c].short}, 1 step`)), ...cols.map((c) => h("th", {}, `${METRICS[c].short}, step 64`)));
    const body = [];
    for (const [camp, studies] of Object.entries(T)) {
      for (const [study, models] of Object.entries(studies)) {
        const bests = {};
        for (const hz of ["one", "h64"]) for (const c of cols) bests[hz + c] = Math.min(...MODELS.map((m) => models[m.key][hz][c]));
        MODELS.forEach((m, i) => body.push(h("tr", { class: i === 0 ? "block" : "" },
          h("td", {}, i === 0 ? `${CAMPAIGNS[camp].name}, ${TESTS[study].name.toLowerCase()}` : ""),
          h("td", {}, m.name),
          ...["one", "h64"].flatMap((hz) => cols.map((c) => {
            const v = models[m.key][hz][c];
            return h("td", { class: v === bests[hz + c] ? "best" : "" }, fmt(v));
          })))));
      }
    }
    $("#results-table").replaceChildren(
      h("div", { class: "scroll" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body))),
      h("p", { class: "fine" }, "From Table 1 of the paper. Bold marks the lowest value per column within each block. Means of per-run means; lower is better."),
    );
  }

  function render() {
    fCamp.value = st.camp;
    fMetric.value = st.metric;
    syncStudy();
    barChart();
    lineChart();
  }
  render();
  table();
}

/* ---------------- Solver validation ---------------- */
// What each case checks, condensed from the paper's validation appendix.
const VAL = {
  laplace: {
    title: "Laplace law",
    checks: "Surface tension gives the right pressure jump across a curved interface.",
    setup: "A slab-shaped drop relaxes under surface tension alone; drops of several radii equilibrate for σ = 0.01–0.05.",
    ref: "Young–Laplace: Δp = 2σ/R.",
    result: "Sphericity 2.504 → 1.000. Δp is linear in 1/R at every σ (R² ≈ 0.999).",
    fig: "val_laplace", alt: "Slab relaxing to a sphere, and pressure jump against inverse radius for five surface tensions",
  },
  wetting: {
    title: "Contact angle on a flat wall",
    checks: "The solver realizes the contact angle it is given, the wettability label on every run.",
    setup: "Sessile drops relax under imposed angles of 30–150°; the angle is measured from a spherical-cap fit.",
    ref: "The imposed angle.",
    result: "Within 2.3° of the imposed angle, 3.8° at the 150° extreme.",
    fig: "val_wetting", alt: "Equilibrated sessile drops for nine imposed angles, and measured against imposed angle",
  },
  washburn: {
    title: "Washburn imbibition",
    checks: "Moving contact-line dynamics, so the time axis of imbibition runs is physical.",
    setup: "A wetting fluid rises into a tube of radius 5 under capillary suction alone (ΔP = 0), θ = 20–70°.",
    ref: "Two-fluid Washburn law.",
    result: "L² is linear in t (R² = 1.000). Rate coefficients are within 1–6% of analytic.",
    fig: "val_capillary_rise", alt: "Penetration length over time against the Washburn solution, with snapshots of the rising front",
  },
  poiseuille: {
    title: "Layered Poiseuille flow",
    checks: "Viscous momentum exchange across the interface, the physics behind the viscosity ratio M.",
    setup: "A pressure-driven channel with viscous fluid at both walls and a thinner fluid in the middle, M = 5–30.",
    ref: "Two-fluid analytic velocity profile.",
    result: "Maximum relative error 0.95–2.58%.",
    fig: "val_layered3d_profile", alt: "Simulated velocity profiles on analytic curves for five viscosity ratios",
  },
  micromodel: {
    title: "Micromodel drainage vs. experiment",
    checks: "Which throat a meniscus invades at a pore junction.",
    setup: "A 3D four-throat junction at 3 µm per voxel, Ca ≈ 10⁻⁴, wetting angle 26°.",
    ref: "Micromodel experiments of Zacharoudiou et al. (2017).",
    result: "The invading phase fills the pore body and exits through the widest throat, as in the experiment.",
    fig: "capillary_micromodel_drainage", alt: "Experimental micromodel images above matching simulation slices",
  },
  lenormand: {
    title: "Displacement regimes",
    checks: "Changing only Ca and M gives the expected front shapes in a real pore geometry.",
    setup: "A 256³ sphere pack at (Ca, M) = (10⁻³, 30), (10⁻³, 0.01) and (10⁻⁵, 30).",
    ref: "Lenormand phase diagram.",
    result: "Stable front, viscous fingering and capillary fingering, respectively.",
    fig: "val_lenormand", alt: "Lenormand phase diagram linked to three sphere-pack snapshots", only: true,
  },
};

{
  // Load each clip only once it nears the viewport; play while visible.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src) v.src = v.dataset.src;
        if (!reduceMotion) v.play().catch(() => {});
      } else v.pause();
    }
  }, { rootMargin: "200px 0px", threshold: 0.1 });
  for (const v of document.querySelectorAll(".val-grid video")) io.observe(v);

  const box = $("#val-box");
  for (const btn of document.querySelectorAll(".val-tile")) {
    const d = VAL[btn.dataset.val];
    btn.setAttribute("aria-label", `${d.title}: details`);
    btn.addEventListener("click", () => {
      $("#vb-title").textContent = d.title;
      const fig = h("img", { src: `media/figs/${d.fig}.webp`, alt: d.alt, class: d.only ? "vb-only" : null });
      if (d.only) $("#vb-media").replaceChildren(fig);
      else {
        const v = h("video", { src: `media/val/${btn.dataset.val}.mp4`, loop: "", playsinline: "", controls: "" });
        v.muted = true; // the property, not the attribute, is what allows autoplay
        if (!reduceMotion) v.play().catch(() => {});
        $("#vb-media").replaceChildren(v, fig);
      }
      $("#vb-facts").replaceChildren(
        h("dt", {}, "Checks"), h("dd", {}, d.checks),
        h("dt", {}, "Setup"), h("dd", {}, d.setup),
        h("dt", {}, "Reference"), h("dd", {}, d.ref),
        h("dt", {}, "Result"), h("dd", {}, d.result),
        h("p", { class: "fine" }, "Details in the paper's validation appendix."),
      );
      box.showModal();
    });
  }
  // close fires asynchronously, so only pause here; the next open replaces the media anyway.
  box.addEventListener("close", () => $("#vb-media video")?.pause());
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// Bar rounded only at the data end (4px), anchored square at the baseline
function roundedBar(x0, y, x1, hgt) {
  const r = Math.min(4, (x1 - x0) / 2, hgt / 2);
  return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 - r},${y + hgt}H${x0}Z`;
}
