// intake.jsx — Vera's intake: the YouTube / research-note analyser.
// Paste a transcript (or your notes) from a video/podcast/article; Vera extracts the
// testable CLAIMS (ticker/theme, direction, horizon), marks each to the tape at intake,
// and scores them as they age — so each SOURCE accrues an honest credibility record.
// Extraction uses window.claude.complete when available, with a deterministic
// keyword fallback (same pattern as analysis.jsx). Nothing here places orders;
// claims are evidence for the round table, weighted by source credibility.
(function () {
  const { useState: useVkState } = React;
  const KEY = "helm_intake_v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || { sources: {}, claims: [] }; } catch (e) { return { sources: {}, claims: [] }; } };
  const save = (j) => { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {} };
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 9);

  const HZ = { wk: { label: "weeks", days: 21, bar: 2.5 }, mo: { label: "months", days: 63, bar: 5 }, qtr: { label: "quarters", days: 180, bar: 9 } };

  function lastPrice(ticker) {
    const s = window.HelmSigma && window.HelmSigma.seriesFor(ticker, 10);
    return s && s.arr && s.arr.length ? { p: s.arr[s.arr.length - 1], real: !!s.real } : null;
  }

  // ---- deterministic fallback extractor: universe tickers + direction words near them ----
  function fallbackExtract(text) {
    const uni = [...(window.HelmUniverse || []).map((u) => u.ticker), ...(window.PMData.allHoldings || []).map((h) => h.ticker)];
    const names = {}; (window.HelmUniverse || []).forEach((u) => { names[u.name.toLowerCase()] = u.ticker; });
    const BULL = /(bullish|buy|long|accumulate|upside|breakout|undervalued|target higher|going up|moon|rip)/i;
    const BEAR = /(bearish|sell|short|downside|overvalued|crash|correction|top is in|going down|avoid)/i;
    const sents = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 15);
    const seen = {}, out = [];
    for (const s of sents) {
      let tkr = null;
      for (const t of uni) { const base = t.replace(".TO", "").replace(".B", ""); if (new RegExp(`\\b${base.replace(/[.^$*+?()[\]{}|\\]/g, "\\$&")}\\b`, "i").test(s) && base.length > 1) { tkr = t; break; } }
      if (!tkr) { for (const nm in names) { if (s.toLowerCase().includes(nm)) { tkr = names[nm]; break; } } }
      const dir = BULL.test(s) ? "bullish" : BEAR.test(s) ? "bearish" : null;
      if (!tkr || !dir || seen[tkr + dir]) continue;
      seen[tkr + dir] = true;
      out.push({ ticker: tkr, direction: dir, horizon: /quarter|year|long.term|cycle/i.test(s) ? "qtr" : /month/i.test(s) ? "mo" : "wk", quote: s.trim().slice(0, 180) });
      if (out.length >= 8) break;
    }
    return out;
  }

  async function extract(text) {
    const ai = (window.helmAI && window.helmAI.complete) || (window.claude && window.claude.complete);
    if (!ai) return { claims: fallbackExtract(text), via: "rules" };
    const prompt = `You are Vera, an investment analyst. From the transcript below, extract the TESTABLE market claims only (a claim = a named ticker or asset + a direction). Ignore vibes, ads, and hedged non-calls.
Reply with ONLY a JSON array, max 8 items, each: {"ticker": "SYMBOL (use .TO suffix for TSX; BTC/ETH/SOL for coins)", "direction": "bullish"|"bearish", "horizon": "wk"|"mo"|"qtr", "quote": "shortest verbatim fragment supporting it (max 25 words)"}
A section headed [ON-SCREEN CHARTS] lists what the video showed visually — claims supported there are chart-backed: append " [chart]" to their quote.
If there are no testable claims, reply [].
TRANSCRIPT:
${text.slice(0, 6000)}`;
    try {
      const out = await ai(prompt);
      const m = out.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(m ? m[0] : out);
      if (!Array.isArray(arr)) throw new Error("shape");
      return { claims: arr.filter((c) => c && c.ticker && /^(bullish|bearish)$/.test(c.direction)).slice(0, 8).map((c) => ({ ...c, horizon: HZ[c.horizon] ? c.horizon : "mo", quote: String(c.quote || "").slice(0, 180) })), via: "ai" };
    } catch (e) { return { claims: fallbackExtract(text), via: "rules (AI reply unusable)" }; }
  }

  // ---- scoring: a claim resolves at its horizon; right if the sign matches the move beyond noise ----
  function scoreClaim(c) {
    const lp = lastPrice(c.ticker);
    if (!lp || !c.p0) return { ...c, status: "untracked" };
    const move = (lp.p / c.p0 - 1) * 100;
    const ageD = Math.round((Date.now() - new Date(c.d).getTime()) / 86400000);
    const hz = HZ[c.horizon] || HZ.mo;
    const cal = Math.round(hz.days * 1.45);
    if (ageD < cal) return { ...c, status: "open", move, ageD, dueD: cal - ageD, real: lp.real };
    const signed = c.direction === "bullish" ? move : -move;
    return { ...c, status: signed >= hz.bar ? "right" : signed <= -hz.bar ? "wrong" : "flat", move, ageD, real: lp.real };
  }

  function credibility(J) {
    const by = {};
    J.claims.map(scoreClaim).forEach((c) => {
      const b = by[c.src] = by[c.src] || { n: 0, open: 0, right: 0, wrong: 0, flat: 0 };
      b.n++;
      if (c.status === "open" || c.status === "untracked") b.open++;
      else b[c.status] = (b[c.status] || 0) + 1;
    });
    Object.keys(by).forEach((s) => { const b = by[s]; const res = b.right + b.wrong + b.flat; b.score = res >= 3 ? Math.round((b.right + b.flat * 0.5) / res * 100) : null; });
    return by;
  }

  // ---- Helm cross-check: re-derive the claim's chart from REAL data (we can't read
  // video pixels — and shouldn't: their chart may be cherry-picked; the tape isn't) ----
  function helmRead(ticker) {
    try {
      const t2 = window.HelmOdds && window.HelmOdds.trend2(ticker);
      const o = window.HelmOdds && window.HelmOdds.compute(ticker);
      const m1 = o && o.horizons ? o.horizons.find((h) => h.k === "1mo") : null;
      const e = window.HelmSigma ? window.HelmSigma.compute(ticker) : null;
      if (!t2) return null;
      let pts = (t2.secular.up ? 1 : 0) + (t2.weekly.up ? 1 : 0), n = 2;
      if (m1 && m1.pUp != null) { pts += m1.pUp >= 55 ? 1 : m1.pUp <= 45 ? 0 : 0.5; n++; }
      return { bull: pts / n, sec: t2.secular.up, wk: t2.weekly.up, pUp: m1 ? m1.pUp : null, z: e ? e.z : null, real: !!t2.real };
    } catch (err) { return null; }
  }
  function crossCheck(c) {
    const r = helmRead(c.ticker);
    if (!r) return null;
    const agree = c.direction === "bullish" ? (r.bull >= 0.65 ? 1 : r.bull <= 0.35 ? -1 : 0) : (r.bull <= 0.35 ? 1 : r.bull >= 0.65 ? -1 : 0);
    const bits = [`sec${r.sec ? "▲" : "▼"}`, `wk${r.wk ? "▲" : "▼"}`];
    if (r.pUp != null) bits.push(`P(up)1mo ${r.pUp.toFixed(0)}%`);
    if (r.z != null) bits.push(`${r.z >= 0 ? "+" : ""}${r.z.toFixed(1)}σ`);
    return { agree, txt: bits.join(" · ") + (r.real ? "" : " · demo"), col: agree > 0 ? "#0e9f6e" : agree < 0 ? "#e02424" : "#b45309", label: agree > 0 ? "data agrees" : agree < 0 ? "data disagrees" : "data mixed" };
  }

  // ---- chart images: read the picture, then DISTRUST it (crossCheck re-derives from the tape) ----
  const IMG_MAX = 1400; // downscale before vision — chart text stays legible, payload stays small
  function fileToRead(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error("not an image"));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error("could not read that file"));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error("could not decode that image"));
        im.onload = () => {
          const sc = Math.min(1, IMG_MAX / Math.max(im.width, im.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
          cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
          const url = cv.toDataURL("image/jpeg", 0.82);
          res({ url, b64: url.split(",")[1], w: cv.width, h: cv.height, name: file.name || "pasted chart" });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  // vision read — window.claude.complete is text-only here, so images go to the Helm vision worker
  // (same CF Worker + key as the YouTube frames lane). No worker → say so honestly, don't fake a read.
  async function readCharts(imgs) {
    const base = (window.HELM_TRANSCRIPT_BASE || "").replace(/\/+$/, "");
    if (!base) return { reads: null, why: "no-worker" };
    try {
      const r = await fetch(`${base}/vision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ images: imgs.map((i) => i.b64) }) });
      const j = await r.json();
      if (!j.vision || !Array.isArray(j.reads) || !j.reads.length) return { reads: null, why: j.error || "no-read" };
      return { reads: j.reads.filter((x) => x && x.read).slice(0, 6), why: null };
    } catch (e) { return { reads: null, why: "worker unreachable" }; }
  }

  function VeraIntake({ accent }) {
    const [text, setText] = useVkState("");
    const [src, setSrc] = useVkState("");
    const [url, setUrl] = useVkState("");
    const [fbusy, setFbusy] = useVkState(false);
    const [fnote, setFnote] = useVkState("");
    const [ferr, setFerr] = useVkState("");
    const [busy, setBusy] = useVkState(false);
    const [draft, setDraft] = useVkState(null); // {claims, via}
    const [imgs, setImgs] = useVkState([]);
    const [ibusy, setIbusy] = useVkState(false);
    const [inote, setInote] = useVkState("");
    const [ierr, setIerr] = useVkState("");
    const [drag, setDrag] = useVkState(false);
    const [, force] = useVkState(0);
    const J = load();
    const scored = J.claims.map(scoreClaim).sort((a, b) => (b.d > a.d ? 1 : -1));
    const cred = credibility(J);

    async function run(tOverride) {
      const body = tOverride != null ? tOverride : text;
      if (!body.trim()) return;
      setBusy(true);
      const r = await extract(body);
      setDraft(r); setBusy(false);
    }

    // ---- chart-image lane: attach → vision read → folded into the transcript as [ON-SCREEN CHARTS] ----
    async function addFiles(list) {
      const files = Array.from(list || []).filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      setInote(""); setIerr("");
      const next = [];
      for (const f of files.slice(0, 6)) { try { next.push(await fileToRead(f)); } catch (e) { setIerr(e.message); } }
      if (next.length) setImgs((p) => [...p, ...next].slice(0, 6));
    }
    async function analyseCharts() {
      if (!imgs.length) return;
      setIbusy(true); setInote(""); setIerr("");
      const { reads, why } = await readCharts(imgs);
      setIbusy(false);
      if (!reads) {
        setIerr(why === "no-worker"
          ? "Chart reading needs the Helm vision worker (deploy feed/transcript-worker.js + set HELM_TRANSCRIPT_BASE). Until then: type what the chart shows below — Vera still extracts the claim and Helm still cross-checks it against real data."
          : `Vision couldn't read these (${why}). Describe the chart below and Vera will cross-check it anyway.`);
        return;
      }
      const tk = reads.filter((r) => r.ticker && r.ticker !== "?").map((r) => r.ticker);
      setInote(`👁 ${reads.length} chart${reads.length > 1 ? "s" : ""} read${tk.length ? " · " + [...new Set(tk)].join(", ") : ""} — now cross-checked against the tape`);
      const block = "[ON-SCREEN CHARTS — read by vision from the screenshots]\n" + reads.map((r) => `(${r.ticker || "?"}) ${r.read}`).join("\n");
      const body = (text.trim() ? text.trim() + "\n\n" : "") + block;
      setText(body);
      await run(body);
    }
    function onPaste(e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const files = [];
      for (let i = 0; i < items.length; i++) { const it = items[i]; if (it.kind === "file" && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) files.push(f); } }
      if (files.length) { e.preventDefault(); addFiles(files); }
    }
    // ⌘V anywhere while the panel is mounted — a bubbled handler on the card misses the common
    // case (user screenshots a chart, clicks the tab, pastes with focus still on <body>).
    React.useEffect(() => {
      document.addEventListener("paste", onPaste);
      return () => document.removeEventListener("paste", onPaste);
    }, [text, imgs.length]);

    async function fetchLink() {
      const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || [])[1];
      if (!id) { setFerr("That doesn't look like a YouTube link — paste the share link (youtu.be/…) or the full watch URL."); return; }
      setFbusy(true); setFerr("");
      try {
        const base = (window.HELM_TRANSCRIPT_BASE || "").replace(/\/+$/, "");
        let j, vis = null;
        if (base) {
          // transcript + vision lanes in parallel; vision is best-effort
          const [tRes, vRes] = await Promise.allSettled([
            fetch(`${base}/?v=${id}`).then((r) => r.json()),
            fetch(`${base}/frames?v=${id}`).then((r) => r.json()),
          ]);
          if (tRes.status !== "fulfilled" || !tRes.value.text) throw new Error((tRes.status === "fulfilled" && tRes.value.error) || "worker returned no transcript");
          j = tRes.value;
          if (vRes.status === "fulfilled" && vRes.value.vision && Array.isArray(vRes.value.reads) && vRes.value.reads.length) vis = vRes.value.reads;
        } else {
          // no worker configured — best-effort public reader (works for many videos, not all)
          const r = await fetch(`https://r.jina.ai/https://www.youtube.com/watch?v=${id}`, { headers: { accept: "text/plain" } });
          if (!r.ok) throw new Error("public reader unavailable");
          const t = await r.text();
          if (t.trim().length < 400) throw new Error("public reader returned too little text");
          j = { text: t.slice(0, 30000), channel: "", title: "" };
        }
        if (j.channel || j.title) setSrc(j.channel || j.title);
        setFnote(`${j.channel || j.title || "video"} · ${j.asr ? "auto-captions (audio, speech-to-text)" : "transcript"} · ${(j.text.length / 1000).toFixed(1)}k chars${vis ? ` · 👁 ${vis.length} on-screen chart${vis.length > 1 ? "s" : ""} read by vision` : ""}`);
        let body = j.text;
        if (vis) body += "\n\n[ON-SCREEN CHARTS — read by vision from the video frames]\n" + vis.map((r2) => `(${r2.t}) ${r2.read}`).join("\n");
        setText(body);
        await run(body);
      } catch (e) {
        setFerr(`Couldn't fetch that video (${e.message}). ${(window.HELM_TRANSCRIPT_BASE || "") ? "" : "For reliable link fetching, deploy feed/transcript-worker.js — a free 2-minute Cloudflare Worker, same account as your quotes worker — and set HELM_TRANSCRIPT_BASE in feed-config.js. "}Meanwhile: YouTube → ⋯ → Show transcript → copy–paste below.`);
      } finally { setFbusy(false); }
    }
    function commit() {
      if (!draft || !draft.claims.length) { setDraft(null); return; }
      const J2 = load();
      const s = src.trim() || "unnamed source";
      draft.claims.forEach((c) => {
        const lp = lastPrice(c.ticker);
        J2.claims.push({ id: uid(), src: s, d: today(), via: draft.via, ...c, p0: lp ? lp.p : null });
      });
      J2.claims = J2.claims.slice(-200);
      save(J2); setDraft(null); setText(""); force((n) => n + 1);
    }
    function drop(id) { const J2 = load(); J2.claims = J2.claims.filter((c) => c.id !== id); save(J2); force((n) => n + 1); }

    const stTag = (c) => c.status === "right" ? ["✓ right", "#0e9f6e"] : c.status === "wrong" ? ["✗ wrong", "#e02424"] : c.status === "flat" ? ["— flat", "var(--muted)"] : c.status === "untracked" ? ["no price", "var(--muted)"] : [`open · ${c.dueD}d left`, "#b45309"];

    return (
      <div className="vk">
        <section className="pm-card">
          <div className="pm-card-eyebrow">Vera · intake — charts / YouTube / podcast / research notes</div>
          <div className="vk-sub">Paste a <strong>chart screenshot</strong>, a YouTube link, or a transcript. Vera pulls out the <strong>testable claims</strong> (name + direction), marks each to the tape today, and scores the source as claims age past their horizon. She reads what's on a chart — but never trusts it: Helm <strong>re-derives the same chart from real data</strong> (trend, σ-band, base-rate odds) and flags whether it agrees.</div>
          <div className="vk-form">
            <div className="vk-linkrow">
              <input className="vk-src" style={{ flex: 1 }} placeholder="YouTube link — paste the share link (https://youtu.be/…) and Vera does the rest" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fetchLink(); }} />
              <button className="vk-go" style={{ background: accent }} disabled={fbusy || busy || !url.trim()} onClick={fetchLink}>{fbusy ? "Fetching…" : busy ? "Extracting…" : "Fetch & analyse"}</button>
            </div>
            {ferr && <div className="vk-ferr">{ferr}</div>}
            {fnote && !ferr && <div className="vk-fnote mono">{fnote}</div>}
            <div className="vk-or mono">or paste a chart screenshot · transcript · your notes ↓</div>
            <div className={"vk-drop" + (drag ? " on" : "") + (imgs.length ? " has" : "")}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
              {imgs.length === 0 ? (
                <div className="vk-drop-empty">
                  <span>Drop a chart screenshot here, or <label className="vk-pick">browse<input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label> — ⌘V works anywhere in this panel</span>
                  <span className="vk-drop-sub">TradingView, a research deck, a video still. Vera reads what's on the chart, then Helm re-derives it from the real series and tells you if they agree.{!(window.HELM_TRANSCRIPT_BASE || "").trim() ? " · vision worker not deployed yet — you can still describe the chart in the notes box." : ""}</span>
                </div>
              ) : (
                <>
                  <div className="vk-thumbs">{imgs.map((im, i) => (
                    <div className="vk-thumb" key={i}>
                      <img src={im.url} alt={im.name} />
                      <button className="vk-thumb-x" title="Remove" onClick={() => setImgs(imgs.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}</div>
                  <div className="vk-actions">
                    <button className="vk-go" style={{ background: accent }} disabled={ibusy || busy} onClick={analyseCharts}>{ibusy ? "Reading charts…" : busy ? "Extracting…" : `Read ${imgs.length} chart${imgs.length > 1 ? "s" : ""}`}</button>
                    <label className="vk-pick sm">add more<input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
                    <button className="vk-cancel" onClick={() => { setImgs([]); setInote(""); }}>Clear</button>
                  </div>
                </>
              )}
            </div>
            {ierr && <div className="vk-ferr">{ierr}</div>}
            {inote && <div className="vk-fnote mono">{inote}</div>}
            <input className="vk-src" placeholder="Source (channel / author — e.g. 'Real Vision', 'InvestAnswers')" value={src} onChange={(e) => setSrc(e.target.value)} />
            <textarea className="vk-text" rows={6} placeholder="Paste the transcript, or describe what the chart shows… (YouTube: ··· → Show transcript → copy)" value={text} onChange={(e) => setText(e.target.value)}></textarea>
            <div className="vk-actions">
              <button className="vk-go" style={{ background: accent }} disabled={busy || fbusy || !text.trim()} onClick={() => run()}>{busy ? "Extracting…" : "Extract claims"}</button>
              <span className="vk-hint mono">{(window.helmAI || (window.claude && window.claude.complete)) ? "AI extraction · rule fallback" : "rule-based extraction (no AI available here)"}</span>
            </div>
          </div>
          {draft && (
            <div className="vk-draft">
              <div className="vk-draft-h">{draft.claims.length ? `${draft.claims.length} testable claim${draft.claims.length > 1 ? "s" : ""} found` : "No testable claims found"} <em>· via {draft.via}</em></div>
              {draft.claims.map((c, i) => {
                const xc = crossCheck(c);
                return (
                <div className="vk-claim" key={i}>
                  <b className="mono">{c.ticker}</b>
                  <span className="vk-dir" style={{ color: c.direction === "bullish" ? "#0e9f6e" : "#e02424" }}>{c.direction}</span>
                  <span className="mono vk-hz">{HZ[c.horizon].label}</span>
                  <span className="vk-qwrap"><span className="vk-q">“{c.quote}”</span>
                  {xc && <span className="vk-xc mono" style={{ color: xc.col }} title="Helm re-derives the chart from the real price series — secular/weekly trend, 1-month base-rate odds, σ vs index"><b>{xc.label}</b> · {xc.txt}</span>}</span>
                  <button className="vk-x" onClick={() => setDraft({ ...draft, claims: draft.claims.filter((_, j2) => j2 !== i) })}>✕</button>
                </div>
                );
              })}
              <div className="vk-actions">
                {draft.claims.length > 0 && <button className="vk-go" style={{ background: "#0e9f6e" }} onClick={commit}>Track these</button>}
                <button className="vk-cancel" onClick={() => setDraft(null)}>Discard</button>
              </div>
            </div>
          )}
        </section>

        {Object.keys(cred).length > 0 && (
          <section className="pm-card">
            <div className="pm-card-eyebrow">Source credibility</div>
            <div className="vk-cred">
              {Object.entries(cred).sort((a, b) => (b[1].score ?? -1) - (a[1].score ?? -1)).map(([s, b]) => (
                <div className="vk-cred-row" key={s}>
                  <span className="vk-cred-src">{s}</span>
                  <span className="mono vk-cred-n">{b.n} claim{b.n > 1 ? "s" : ""} · {b.open} open</span>
                  {b.score != null
                    ? <span className="vk-cred-score mono" style={{ color: b.score >= 60 ? "#0e9f6e" : b.score <= 40 ? "#e02424" : "#b45309" }}>{b.score}% hit</span>
                    : <span className="vk-cred-score mono" style={{ color: "var(--muted)" }}>needs ≥3 resolved</span>}
                  <span className="vk-cred-bar"><i style={{ width: (b.score ?? 0) + "%", background: b.score >= 60 ? "#0e9f6e" : b.score <= 40 ? "#e02424" : "#b45309" }} /></span>
                </div>
              ))}
            </div>
            <div className="vk-note">Hit = direction right beyond noise ({HZ.wk.bar}% / {HZ.mo.bar}% / {HZ.qtr.bar}% by horizon) at the claim's horizon; flat counts half. Credibility should gate how much weight a source gets at the round table.</div>
          </section>
        )}

        {scored.length > 0 && (
          <section className="pm-card">
            <div className="pm-card-eyebrow">Claim ledger · {scored.length}</div>
            <div className="vk-ledger">
              {scored.slice(0, 40).map((c) => {
                const [l, col] = stTag(c);
                return (
                  <div className="vk-row" key={c.id}>
                    <span className="mono vk-row-d">{c.d.slice(5)}</span>
                    <b className="mono vk-row-t" onClick={() => window.dispatchEvent(new CustomEvent("helm:nav", { detail: { page: "Research", ticker: c.ticker } }))}>{c.ticker}</b>
                    <span style={{ color: c.direction === "bullish" ? "#0e9f6e" : "#e02424" }}>{c.direction}</span>
                    <span className="mono vk-row-mv" style={{ color: (c.move ?? 0) >= 0 ? "#0e9f6e" : "#e02424" }}>{c.move != null ? (c.move > 0 ? "+" : "") + c.move.toFixed(1) + "%" : "—"}</span>
                    <span className="vk-row-st mono" style={{ color: col }}>{l}</span>
                    <span className="vk-row-src">{c.src}</span>
                    <button className="vk-x" onClick={() => drop(c.id)} title="remove">✕</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  const VK_CSS = `
  .vk { display: flex; flex-direction: column; gap: 14px; }
  .vk-sub { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; margin: 6px 0 12px; max-width: 70ch; }
  .vk-form { display: flex; flex-direction: column; gap: 8px; }
  .vk-linkrow { display: flex; gap: 8px; align-items: stretch; }
  .vk-ferr { font-size: 11px; color: #b45309; background: #b453090f; border: 1px solid #b4530933; border-radius: 8px; padding: 7px 10px; line-height: 1.5; }
  .vk-fnote { font-size: 10px; color: #0e9f6e; line-height: 1.5; }
  .vk-or { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .vk-drop { border: 1px dashed var(--line); border-radius: 10px; padding: 14px; background: var(--panel); display: flex; flex-direction: column; gap: 10px; transition: border-color .12s, background .12s; }
  .vk-drop.on { border-color: #0e9f6e; background: #0e9f6e0a; }
  .vk-drop.has { border-style: solid; }
  .vk-drop-empty { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-2, #444); line-height: 1.5; }
  .vk-drop-sub { font-size: 11px; color: var(--muted); }
  .vk-pick { color: var(--accent, #2563eb); font-weight: 600; cursor: pointer; text-decoration: underline; }
  .vk-pick.sm { font-size: 11.5px; text-decoration: none; }
  .vk-pick input { display: none; }
  .vk-thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
  .vk-thumb { position: relative; width: 132px; height: 84px; border-radius: 7px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
  .vk-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vk-thumb-x { position: absolute; top: 3px; right: 3px; font: inherit; font-size: 10px; line-height: 1; color: #fff; background: #0b0f17b0; border: 0; border-radius: 5px; padding: 3px 5px; cursor: pointer; }
  .vk-src, .vk-text { font: inherit; font-size: 13px; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; }
  .vk-text { resize: vertical; line-height: 1.5; }
  .vk-src:focus, .vk-text:focus { outline: none; border-color: var(--muted); }
  .vk-actions { display: flex; align-items: center; gap: 12px; }
  .vk-go { font: inherit; font-size: 12.5px; font-weight: 700; color: #fff; border: 0; border-radius: 8px; padding: 7px 15px; cursor: pointer; }
  .vk-go:disabled { opacity: 0.45; cursor: default; }
  .vk-cancel { font: inherit; font-size: 12px; font-weight: 600; color: var(--ink-2); background: none; border: 1px solid var(--line); border-radius: 8px; padding: 7px 13px; cursor: pointer; }
  .vk-hint { font-size: 10px; color: var(--muted); }
  .vk-draft { border-top: 1px solid var(--line-2, #f0f2f5); margin-top: 12px; padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
  .vk-draft-h { font-size: 12.5px; font-weight: 700; }
  .vk-draft-h em { font-weight: 400; font-style: normal; color: var(--muted); font-size: 11px; }
  .vk-claim { display: flex; align-items: baseline; gap: 9px; font-size: 12px; }
  .vk-claim b { flex: none; }
  .vk-dir { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; flex: none; }
  .vk-hz { font-size: 10px; color: var(--muted); flex: none; }
  .vk-qwrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .vk-q { color: var(--ink-2); font-size: 11.5px; line-height: 1.45; }
  .vk-xc { font-size: 10px; }
  .vk-xc b { font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .vk-x { font: inherit; font-size: 11px; color: var(--muted); background: none; border: 0; cursor: pointer; padding: 0 2px; margin-left: auto; flex: none; }
  .vk-x:hover { color: #e02424; }
  .vk-cred { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; }
  .vk-cred-row { display: grid; grid-template-columns: minmax(120px, 1fr) auto auto 130px; gap: 12px; align-items: center; font-size: 12px; }
  .vk-cred-n { font-size: 10.5px; color: var(--muted); }
  .vk-cred-score { font-size: 11.5px; font-weight: 700; }
  .vk-cred-bar { height: 5px; background: var(--line-2, #f0f2f5); border-radius: 99px; overflow: hidden; }
  .vk-cred-bar i { display: block; height: 100%; border-radius: 99px; }
  .vk-note { font-size: 10.5px; color: var(--muted); line-height: 1.5; margin-top: 10px; }
  .vk-ledger { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
  .vk-row { display: grid; grid-template-columns: 40px 64px 58px 58px 110px 1fr 20px; gap: 8px; align-items: baseline; font-size: 11.5px; padding: 5px 0; border-bottom: 1px solid var(--line-2, #f0f2f5); }
  .vk-row:last-child { border-bottom: 0; }
  .vk-row-d { color: var(--muted); font-size: 10px; }
  .vk-row-t { cursor: pointer; }
  .vk-row-t:hover { text-decoration: underline; }
  .vk-row-mv, .vk-row-st { font-size: 10.5px; }
  .vk-row-src { color: var(--muted); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;
  if (!document.getElementById("helm-vk-css")) {
    const el = document.createElement("style"); el.id = "helm-vk-css"; el.textContent = VK_CSS; document.head.appendChild(el);
  }

  window.HelmIntake = { load, scoreClaim, credibility };
  window.VeraIntake = VeraIntake;
})();
