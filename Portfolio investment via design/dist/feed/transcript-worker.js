// transcript-worker.js — Cloudflare Worker: YouTube link → transcript JSON, plus an
// optional VISION lane that reads on-screen charts/schemas with Claude.
// Why: browsers can't read youtube.com cross-origin, so Helm's Vera-intake needs one tiny
// server-side hop. Same free tier as quotes-worker.js.
//
// DEPLOY (one time, ~2 min — mirrors quotes-worker):
//   1 Cloudflare dash → Workers & Pages → Create → "helm-transcript" → paste this file → Deploy
//   2 Copy the URL (https://helm-transcript.<you>.workers.dev)
//   3 In feed-config.js set: window.HELM_TRANSCRIPT_BASE = "<that URL>"
// VISION lane (optional — enables /frames with AI chart reading):
//   4 Worker → Settings → Variables & Secrets → add SECRET  ANTHROPIC_API_KEY = sk-ant-…
//     (get one at console.anthropic.com; each video read costs roughly 1–3¢)
//   Without the key, /frames still returns raw storyboard frame URLs (no AI read).
//
// GET /?v=<video id or URL>        → { videoId, title, channel, asr, text }
// GET /frames?v=<id or URL>        → { videoId, frames: [dataURL…], vision: true|false,
//                                      reads: [{t, read}] }   ← reads only with the key
// POST /vision  { images:[base64] } → { vision, reads:[{ticker,read,direction}] }  ← needs the key
//   (user-pasted chart screenshots — TradingView etc. Helm cross-checks every read.)
// Errors: 400 bad input · 404 no captions/storyboard · 502 upstream unreachable.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type", "content-type": "application/json; charset=utf-8" };
const out = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: CORS });
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "accept-language": "en-US,en;q=0.9" };
const vidId = (raw) => (raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || raw.match(/^([\w-]{11})$/) || [])[1];

async function watchPage(id) {
  return await (await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: UA })).text();
}
const meta = (page) => ({
  title: ((page.match(/<meta name="title" content="([^"]*)"/) || [])[1] || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
  channel: (page.match(/"ownerChannelName":"([^"]*)"/) || page.match(/"author":"([^"]*)"/) || [])[1] || "",
});

// ---- lane 1: transcript (audio) ----
async function transcript(id) {
  const page = await watchPage(id);
  const { title, channel } = meta(page);
  const m = page.match(/"captionTracks":(\[.+?\])\s*,\s*"/);
  if (!m) return out({ error: "this video has no captions/transcript", videoId: id, title, channel }, 404);
  let tracks;
  try { tracks = JSON.parse(m[1]); } catch (e) { return out({ error: "caption metadata unparseable" }, 502); }
  const tr = tracks.find((t) => (t.languageCode || "").startsWith("en") && !(t.kind === "asr")) || tracks.find((t) => (t.languageCode || "").startsWith("en")) || tracks[0];
  const cap = await (await fetch(tr.baseUrl + "&fmt=json3")).json();
  const text = (cap.events || []).flatMap((e) => (e.segs || []).map((s) => s.utf8)).join("").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return out({ error: "empty transcript", videoId: id, title, channel }, 404);
  return out({ videoId: id, title, channel, lang: tr.languageCode, asr: tr.kind === "asr", text: text.slice(0, 60000) });
}

// ---- lane 2: storyboard frames (screen) + optional Claude vision read ----
// YouTube ships a "storyboard" (filmstrip of small screenshots across the whole video)
// with every watch page — no video download needed.
async function frames(id, env) {
  const page = await watchPage(id);
  const { title, channel } = meta(page);
  const sbRaw = (page.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/) || page.match(/"storyboards":.*?"spec":"([^"]+)"/) || [])[1];
  if (!sbRaw) return out({ error: "no storyboard on this video", videoId: id, title, channel }, 404);
  const spec = sbRaw.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  // spec = baseUrl|level0|level1|... ; each level = width#height#count#rows#cols#interval#name#sigh
  const parts = spec.split("|");
  const base = parts[0];
  const levels = parts.slice(1).map((s) => s.split("#"));
  const lvl = levels[levels.length - 1]; // highest resolution level
  const L = levels.length - 1;
  const [w, h, count, rows, cols, , name, sigh] = [+lvl[0], +lvl[1], +lvl[2], +lvl[3], +lvl[4], 0, lvl[6], lvl[7]];
  const perSheet = rows * cols;
  const sheets = Math.ceil(count / perSheet);
  // pull up to 3 sheets spread across the video (start / middle / late)
  const wanted = sheets <= 3 ? [...Array(sheets).keys()] : [0, Math.floor(sheets / 2), sheets - 1];
  const tiles = [];
  for (const sn of wanted) {
    const url = base.replace("$L", String(L)).replace("$N", name) + `&sigh=${encodeURIComponent(sigh)}`;
    const sheetUrl = url.replace("$M", String(sn));
    const r = await fetch(sheetUrl, { headers: UA });
    if (!r.ok) continue;
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    tiles.push({ sheet: sn, dataUrl: "data:image/jpeg;base64," + btoa(bin), grid: { rows, cols, w, h } });
  }
  if (!tiles.length) return out({ error: "storyboard sheets unreachable", videoId: id, title, channel }, 502);

  // no key → return the sheets; Helm can at least show them
  if (!env.ANTHROPIC_API_KEY) return out({ videoId: id, title, channel, vision: false, frames: tiles.map((t) => t.dataUrl), note: "set ANTHROPIC_API_KEY on the worker to enable AI chart reading" });

  // vision read: each sheet is a grid of frames — perfect input for "find the charts"
  const content = [];
  tiles.forEach((t) => content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.dataUrl.split(",")[1] } }));
  content.push({ type: "text", text: `These are storyboard sheets (grids of sequential frames, early→late) from a finance YouTube video titled "${title}" by "${channel}". Find frames showing PRICE CHARTS, tables, or schemas. For each distinct chart/schema (max 6), reply in a JSON array: {"t":"rough position early|mid|late","read":"one sentence: what asset/series it shows and the visual claim being made (trend, level, target, band)"}. Ignore talking-head frames. Reply ONLY the JSON array, [] if none.` });
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 800, messages: [{ role: "user", content }] }),
  });
  if (!ai.ok) return out({ videoId: id, title, channel, vision: false, frames: tiles.map((t) => t.dataUrl), error: "vision call failed: " + ai.status });
  const rj = await ai.json();
  let reads = [];
  try { reads = JSON.parse((rj.content[0].text.match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch (e) {}
  return out({ videoId: id, title, channel, vision: true, reads, frames: [] }); // frames omitted when read succeeded (payload size)
}

// ---- lane 3: user-supplied chart screenshots (TradingView, decks, video stills) ----
// POST /vision  { images: [base64 jpeg…] }  → { vision, reads:[{ticker,read,direction}] }
// Same key, same model as /frames. Helm always cross-checks these reads against real prices.
async function visionCharts(req, env) {
  if (!env.ANTHROPIC_API_KEY) return out({ vision: false, error: "no ANTHROPIC_API_KEY on this worker — chart reading is off" }, 200);
  let body;
  try { body = await req.json(); } catch (e) { return out({ error: "POST JSON { images: [base64…] }" }, 400); }
  const imgs = (body.images || []).filter((s) => typeof s === "string" && s.length > 100).slice(0, 6);
  if (!imgs.length) return out({ error: "no images" }, 400);
  const content = imgs.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d.replace(/^data:[^,]+,/, "") } }));
  content.push({ type: "text", text: `These are chart screenshots a retail investor captured (TradingView, a research deck, a video still).
For EACH image report only what is legibly ON the chart. Reply with ONLY a JSON array, max 6 items, each:
{"ticker":"SYMBOL if the chart is labelled with one, else ?","read":"one line: instrument, timeframe, trend direction, any marked level or pattern","direction":"bullish"|"bearish"|"unclear"}
Do not infer prices you cannot read. Do not give advice. Skip any image that is not a chart.` });
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 700, messages: [{ role: "user", content }] }),
  });
  if (!ai.ok) return out({ vision: false, error: "vision call failed: " + ai.status }, 200);
  const rj = await ai.json();
  let reads = [];
  try { reads = JSON.parse((rj.content[0].text.match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch (e) {}
  return out({ vision: true, reads });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      const u = new URL(req.url);
      if (u.pathname === "/vision") { if (req.method !== "POST") return out({ error: "POST images to /vision" }, 400); return await visionCharts(req, env || {}); }
      const id = vidId(u.searchParams.get("v") || "");
      if (!id) return out({ error: "pass ?v=<YouTube URL or 11-char video id>" }, 400);
      if (u.pathname === "/frames") return await frames(id, env || {});
      return await transcript(id);
    } catch (e) {
      return out({ error: "fetch failed: " + (e && e.message) }, 502);
    }
  },
};
