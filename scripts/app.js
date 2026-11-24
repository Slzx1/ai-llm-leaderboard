(() => {
  "use strict";

  const LOCAL_DATA_URL = "data/leaderboard.json";
  const REMOTE_CDN_URL = "https://raw.githubusercontent.com/Slzx1/ai-llm-leaderboard/main/data/leaderboard.json";
  const SWR_CACHE_KEY = "modelrank_swr_cache_v2";
  const SWR_EDGE_KEY = "modelrank_edge_api_url";
  const SWR_DEDUP_MS = 5 * 60 * 1000; // 5 min minimum interval between passive focus/online revalidations
  const REPO_URL = "https://github.com/Slzx1/ai-llm-leaderboard";
  const COMPARE_COLORS = ["#1a56db", "#0d9488", "#d97706", "#e11d48"];
  const PAGE_STEP = 50;

  const state = {
    data: null,
    trackId: "aa_intelligence",
    sortKey: "intelligenceIndex",
    sortDir: "desc",
    search: "",
    license: "all", // all | open | closed
    vendor: "all",
    dedupRelease: true,
    flagshipOnly: false,
    visibleCount: PAGE_STEP,
    compareIds: [],
    activeDrawerModel: null,
    revalidating: false,
    lastRevalidatedAt: 0,
    swrSource: "",
    statusTimer: null,
  };

  const el = {
    trackTabs: document.getElementById("track-tabs"),
    summaryStrip: document.getElementById("summary-strip"),
    trackDescBar: document.getElementById("track-desc-bar"),
    searchInput: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    vendorSelect: document.getElementById("vendor-select"),
    vendorRibbon: document.getElementById("vendor-ribbon"),
    dedupRelease: document.getElementById("dedup-release"),
    dedupReleaseWrap: document.getElementById("dedup-release-wrap"),
    flagshipOnly: document.getElementById("flagship-only"),
    flagshipWrap: document.getElementById("flagship-toggle-wrap"),
    tableHead: document.getElementById("table-head"),
    tableBody: document.getElementById("table-body"),
    tableFooter: document.getElementById("table-footer"),
    syncIndicator: document.querySelector(".sync-indicator"),
    syncStatusLabel: document.getElementById("sync-status-label"),
    btnSources: document.getElementById("btn-sources"),
    btnRefresh: document.getElementById("btn-refresh"),
    btnTheme: document.getElementById("btn-theme"),
    iconMoon: document.getElementById("icon-theme-moon"),
    iconSun: document.getElementById("icon-theme-sun"),
    drawerBackdrop: document.getElementById("drawer-backdrop"),
    detailDrawer: document.getElementById("detail-drawer"),
    drawerTitleGroup: document.getElementById("drawer-title-group"),
    drawerBody: document.getElementById("drawer-body"),
    drawerFooter: document.getElementById("drawer-footer"),
    drawerClose: document.getElementById("drawer-close"),
    compareDock: document.getElementById("compare-dock"),
    compareDockChips: document.getElementById("compare-dock-chips"),
    btnClearCompare: document.getElementById("btn-clear-compare"),
    btnOpenCompare: document.getElementById("btn-open-compare"),
    compareModal: document.getElementById("compare-modal"),
    compareModalClose: document.getElementById("compare-modal-close"),
    compareModalBody: document.getElementById("compare-modal-body"),
    sourcesModal: document.getElementById("sources-modal"),
    sourcesModalClose: document.getElementById("sources-modal-close"),
    sourcesModalBody: document.getElementById("sources-modal-body"),
    toast: document.getElementById("toast"),
  };

  /* ========================================================================
     Utilities & Column-Aware Formatters
     ======================================================================== */

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatNumber(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("zh-CN");
  }

  function formatColValue(val, col) {
    if (val == null || Number.isNaN(val)) return "—";
    const num = Number(val);
    const fmt = col?.format || "index";
    switch (fmt) {
      case "pct":
        return `${num.toFixed(1)}%`;
      case "elo":
        return Math.round(num).toString();
      case "speed":
        return `${Math.round(num)}`;
      case "sec":
        return `${num.toFixed(2)}s`;
      case "usd":
        if (num === 0) return "$0";
        return num < 1 ? `$${num.toFixed(2)}` : `$${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
      case "usdTask":
        if (num === 0) return "$0";
        return num < 0.01 ? `$${num.toFixed(4)}` : `$${num.toFixed(2)}`;
      case "index":
      default:
        return num.toFixed(1);
    }
  }

  function formatContext(ctx) {
    if (!ctx) return "—";
    if (ctx >= 1_000_000) {
      const m = (ctx / 1_000_000).toFixed(1).replace(/\.0$/, "");
      return `${m}M`;
    }
    if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K`;
    return String(ctx);
  }

  function formatDateTimeLocal(iso) {
    if (!iso) return "未知";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatRelativeTime(iso) {
    if (!iso) return "";
    const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const hrs = Math.floor(diffMin / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    return `${Math.floor(hrs / 24)} 天前`;
  }

  let toastTimeout = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.toast.classList.remove("show"), 3200);
  }

  function getVendor(vendorId) {
    const v = state.data?.vendors?.[vendorId];
    if (v) return v;
    return {
      id: vendorId || "unknown",
      name: vendorId ? vendorId.toUpperCase() : "Unknown",
      nameZh: vendorId || "未知厂商",
      icon: "",
      mono: false,
    };
  }

  function renderVendorIconHtml(vendorId, sizeClass = "") {
    const v = getVendor(vendorId);
    const cls = sizeClass ? `vendor-icon-box ${sizeClass}` : "vendor-icon-box";
    if (v.icon) {
      return `
        <span class="${cls}" title="${esc(v.name)}${v.nameZh && v.nameZh !== v.name ? ` (${esc(v.nameZh)})` : ""}">
          <img
            class="vendor-icon-img"
            src="${esc(v.icon)}"
            alt="${esc(v.name)} 官方图标"
            data-mono="${v.mono ? "true" : "false"}"
            loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='inline';"
          />
          <span class="vendor-fallback-text" style="display:none">${esc(v.name.slice(0, 2))}</span>
        </span>
      `;
    }
    return `
      <span class="${cls}" title="${esc(v.name)}">
        <span class="vendor-fallback-text">${esc(v.name.slice(0, 2))}</span>
      </span>
    `;
  }

  /* ========================================================================
     Theme Management
     ======================================================================== */

  function initTheme() {
    const saved = localStorage.getItem("modelrank_theme");
    const theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("modelrank_theme", theme);
    el.iconMoon.style.display = theme === "dark" ? "none" : "block";
    el.iconSun.style.display = theme === "dark" ? "block" : "none";
  }

  /* ========================================================================
     SWR (Stale-While-Revalidate) Data Engine
     1. Stale: Immediately hydrates from localStorage cache in <5ms
     2. Revalidate: Silently checks Edge Worker / GitHub Raw CDN / Same-Origin JSON
     3. Focus & Online Revalidation: Refreshes automatically when returning to tab
     ======================================================================== */

  function getConfiguredEdgeApi() {
    const param = new URLSearchParams(location.search).get("api");
    if (param && /^https?:\/\//i.test(param)) {
      localStorage.setItem(SWR_EDGE_KEY, param);
      return param;
    }
    return localStorage.getItem(SWR_EDGE_KEY) || "";
  }

  function readSwrCache() {
    try {
      const raw = localStorage.getItem(SWR_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.tracks && parsed?.meta) return parsed;
    } catch {
      // ignore corrupted cache
    }
    return null;
  }

  function writeSwrCache(json) {
    try {
      localStorage.setItem(SWR_CACHE_KEY, JSON.stringify(json));
    } catch {
      // ignore quota exceeded
    }
  }

  function applyPayload(json) {
    state.data = json;
    const hashTrack = location.hash.replace(/^#/, "");
    const order = json.meta.trackOrder || Object.keys(json.tracks);
    if (hashTrack && json.tracks[hashTrack]) {
      state.trackId = hashTrack;
    } else if (!json.tracks[state.trackId]) {
      state.trackId = order[0];
    }

    const activeTrack = getActiveTrack();
    if (!activeTrack.columns.some((c) => c.key === state.sortKey)) {
      const primary = activeTrack.columns[0];
      state.sortKey = primary.key;
      state.sortDir = primary.lowerIsBetter ? "asc" : "desc";
    }

    renderAll();
    updateSyncStatus();
  }

  async function fetchFromBestEndpoint(force = false) {
    const isLocalHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    const edgeApi = getConfiguredEdgeApi();
    const candidates = [];

    if (edgeApi) {
      const sep = edgeApi.includes("?") ? "&" : "?";
      candidates.push({
        label: "Cloudflare Edge SWR",
        url: force ? `${edgeApi}${sep}force=1&t=${Date.now()}` : edgeApi,
      });
    }

    if (isLocalHost) {
      candidates.push({
        label: "本地预览快照",
        url: force ? `${LOCAL_DATA_URL}?t=${Date.now()}` : LOCAL_DATA_URL,
      });
    } else {
      // Fastly CDN for GitHub Raw reflects hourly change-detection commits immediately (5m edge cache)
      candidates.push({
        label: "GitHub CDN (SWR)",
        url: force ? `${REMOTE_CDN_URL}?t=${Date.now()}` : REMOTE_CDN_URL,
      });
      candidates.push({
        label: "Pages 静态快照",
        url: force ? `${LOCAL_DATA_URL}?t=${Date.now()}` : LOCAL_DATA_URL,
      });
    }

    let lastErr = null;
    for (const c of candidates) {
      try {
        const resp = await fetch(c.url, { cache: force ? "no-store" : "default" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (json?.tracks && json?.meta) {
          return { json, source: c.label };
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("所有数据源均不可达");
  }

  async function revalidateSwr({ force = false, silent = true } = {}) {
    if (state.revalidating) return;
    if (!force && Date.now() - state.lastRevalidatedAt < SWR_DEDUP_MS && state.data) {
      return;
    }

    state.revalidating = true;
    el.syncIndicator?.classList.add("is-revalidating");
    if (!silent) {
      el.btnRefresh.classList.add("is-loading");
      el.btnRefresh.disabled = true;
    }
    updateSyncStatus();

    try {
      const prevHash = state.data?.meta?.contentHash || state.data?.meta?.generatedAt;
      const { json, source } = await fetchFromBestEndpoint(force);
      state.lastRevalidatedAt = Date.now();
      state.swrSource = source;

      const nextHash = json.meta?.contentHash || json.meta?.generatedAt;
      const hasNewer = !prevHash || nextHash !== prevHash;

      if (hasNewer || !state.data) {
        writeSwrCache(json);
        applyPayload(json);
        if (prevHash) {
          showToast(`SWR 已同步最新排行数据 (${formatDateTimeLocal(json.meta.generatedAt)})`);
        } else if (!silent) {
          showToast(`已加载最新排行数据 (${source})`);
        }
      } else if (!silent) {
        showToast(`已是最新排行（数据指纹 ${nextHash.slice(0, 8)} · ${source}）`);
      }
    } catch (err) {
      if (!silent || !state.data) {
        showToast(`后台校验失败：${err.message}`);
      }
    } finally {
      state.revalidating = false;
      el.syncIndicator?.classList.remove("is-revalidating");
      el.btnRefresh.classList.remove("is-loading");
      el.btnRefresh.disabled = false;
      updateSyncStatus();
    }
  }

  function updateSyncStatus() {
    if (state.revalidating) {
      el.syncStatusLabel.textContent = "SWR 后台校验更新中...";
      return;
    }
    if (!state.data) return;
    const gen = state.data.meta.generatedAt;
    el.syncStatusLabel.textContent = `SWR 已保鲜 · 数据更新于 ${formatRelativeTime(gen)}`;
  }

  /* ========================================================================
     Track, Sorting & Filtering Logic
     ======================================================================== */

  function getActiveTrack() {
    return state.data.tracks[state.trackId];
  }

  function getFilteredAndSortedModels() {
    const track = getActiveTrack();
    const q = state.search.trim().toLowerCase();

    let list = track.models.filter((m) => {
      if (state.license === "open" && !m.isOpen) return false;
      if (state.license === "closed" && m.isOpen) return false;
      if (state.vendor !== "all" && m.vendor !== state.vendor) return false;
      if (q) {
        const v = getVendor(m.vendor);
        const hay = `${m.name} ${m.releaseName || ""} ${m.vendor} ${v.name} ${v.nameZh} ${m.license}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = key === "votes" ? a.votes : a.scores?.[key];
      const vb = key === "votes" ? b.votes : b.scores?.[key];
      const aMissing = va == null || Number.isNaN(va);
      const bMissing = vb == null || Number.isNaN(vb);
      if (aMissing && bMissing) return a.rank - b.rank;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (va === vb) return a.rank - b.rank;
      return (va - vb) * dir;
    });

    // Deduplicate same model release's reasoning effort tiers (keep strongest under current sort)
    if (track.supportsReleaseDedup && state.dedupRelease) {
      const seenRel = new Set();
      list = list.filter((m) => {
        const rk = m.releaseSlug || m.name;
        if (seenRel.has(rk)) return false;
        seenRel.add(rk);
        return true;
      });
    }

    // Flagship deduplication per vendor
    if (state.flagshipOnly) {
      const seen = new Set();
      list = list.filter((m) => {
        if (seen.has(m.vendor)) return false;
        seen.add(m.vendor);
        return true;
      });
    }

    return list;
  }

  function computeColumnStats(track, modelsSubset) {
    const src = modelsSubset && modelsSubset.length ? modelsSubset : track.models;
    const stats = {};
    for (const col of track.columns) {
      const vals = src
        .map((m) => m.scores?.[col.key])
        .filter((v) => v != null && !Number.isNaN(v))
        .sort((a, b) => (col.lowerIsBetter ? a - b : b - a));
      const best = vals[0] ?? 100;
      const worst = vals[vals.length - 1] ?? 0;
      stats[col.key] = {
        max: col.lowerIsBetter ? worst : best,
        min: col.lowerIsBetter ? best : worst,
        best,
        worst,
        top5: vals[Math.min(4, Math.max(0, vals.length - 1))] ?? best,
        top15: vals[Math.min(14, Math.max(0, vals.length - 1))] ?? best,
        lowerIsBetter: Boolean(col.lowerIsBetter),
      };
    }
    return stats;
  }

  /* ========================================================================
     Rendering
     ======================================================================== */

  function renderAll() {
    const track = getActiveTrack();
    el.dedupReleaseWrap.style.display = track.supportsReleaseDedup ? "inline-flex" : "none";
    renderTrackTabs();
    renderSummaryStrip();
    renderTrackDesc();
    renderVendorControls();
    renderTable();
    renderCompareDock();
  }

  function renderTrackTabs() {
    const order = state.data.meta.trackOrder || Object.keys(state.data.tracks);
    el.trackTabs.innerHTML = order
      .filter((id) => state.data.tracks[id])
      .map((id) => {
        const t = state.data.tracks[id];
        const active = id === state.trackId ? "active" : "";
        const displayCnt = t.supportsReleaseDedup
          ? new Set(t.models.map((m) => m.releaseSlug || m.name)).size
          : t.models.length;
        return `
          <button
            class="track-tab ${active}"
            role="tab"
            aria-selected="${id === state.trackId}"
            data-track="${esc(id)}"
            type="button"
          >
            <span>${esc(t.shortName)}</span>
            <span class="track-tab-count">${displayCnt}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderSummaryStrip() {
    const track = getActiveTrack();
    const primaryCol = track.columns[0];
    const topModel = track.models[0];
    const topOpen = track.models.find((m) => m.isOpen);
    const vendorSet = new Set(track.models.map((m) => m.vendor));
    const uniqueReleases = track.supportsReleaseDedup
      ? new Set(track.models.map((m) => m.releaseSlug || m.name)).size
      : track.models.length;
    const openCount = track.models.filter((m) => m.isOpen).length;
    const sourceMeta = state.data.meta.sources.find((s) => s.id === track.source);

    const topHtml = topModel
      ? `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topModel.vendor, "sm")}
          <span class="summary-main" title="${esc(topModel.name)}">${esc(topModel.name)}</span>
          <span class="summary-score">${formatColValue(topModel.score, primaryCol)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topModel.vendor).name)} · ${topModel.isOpen ? "开源权重" : "闭源旗舰"}</div>
      `
      : `<div class="summary-main">—</div>`;

    const openHtml = topOpen
      ? `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topOpen.vendor, "sm")}
          <span class="summary-main" title="${esc(topOpen.name)}">${esc(topOpen.name)}</span>
          <span class="summary-score">${formatColValue(topOpen.score, primaryCol)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topOpen.vendor).name)} · 总榜 #${topOpen.rank} (${esc(topOpen.license)})</div>
      `
      : `
        <div class="summary-value-row"><span class="summary-main">暂无开源上榜</span></div>
        <div class="summary-meta">该赛道当前均为闭源 API 模型</div>
      `;

    el.summaryStrip.innerHTML = `
      <div class="summary-cell">
        <div class="summary-label">
          <span>当前赛道 #1 领跑</span>
          <span class="mono">${esc(primaryCol.label)}</span>
        </div>
        ${topHtml}
      </div>

      <div class="summary-cell">
        <div class="summary-label">
          <span>开源权重 #1 最佳</span>
          <span class="mono">Open Weights</span>
        </div>
        ${openHtml}
      </div>

      <div class="summary-cell">
        <div class="summary-label"><span>评测覆盖</span></div>
        <div class="summary-value-row">
          <span class="summary-main mono">${uniqueReleases} 系列 / ${track.models.length} 档位</span>
          <span class="summary-score" style="color:var(--text-secondary)">${vendorSet.size} 厂商</span>
        </div>
        <div class="summary-meta">开源 ${openCount} 项 · 闭源 ${track.models.length - openCount} 项</div>
      </div>

      <div class="summary-cell">
        <div class="summary-label">
          <span>权威数据源</span>
          <span class="mono">${esc(track.publishDate || "实时")}</span>
        </div>
        <div class="summary-value-row">
          <span class="summary-main">${esc(sourceMeta?.name || track.source)}</span>
        </div>
        <div class="summary-meta">自动同步于 ${esc(formatDateTimeLocal(state.data.meta.generatedAt))}</div>
      </div>
    `;
  }

  function renderTrackDesc() {
    const track = getActiveTrack();
    const src = state.data.meta.sources.find((s) => s.id === track.source);
    el.trackDescBar.innerHTML = `
      <span>${esc(track.description)}</span>
      ${
        src
          ? `<a class="track-source-link" href="${esc(src.url)}" target="_blank" rel="noopener">
               查看 ${esc(src.name)} 原始榜单 ↗
             </a>`
          : ""
      }
    `;
  }

  function renderVendorControls() {
    const track = getActiveTrack();
    const counts = new Map();
    const seenPerVendor = new Map();
    for (const m of track.models) {
      const k = track.supportsReleaseDedup && state.dedupRelease ? (m.releaseSlug || m.name) : m.id;
      if (!seenPerVendor.has(m.vendor)) seenPerVendor.set(m.vendor, new Set());
      seenPerVendor.get(m.vendor).add(k);
    }
    for (const [vid, set] of seenPerVendor.entries()) {
      counts.set(vid, set.size);
    }

    const sortedVendors = [...counts.entries()].sort((a, b) => {
      const bestA = track.models.find((m) => m.vendor === a[0])?.rank ?? 999;
      const bestB = track.models.find((m) => m.vendor === b[0])?.rank ?? 999;
      return bestA - bestB;
    });

    if (state.vendor !== "all" && !counts.has(state.vendor)) {
      state.vendor = "all";
    }

    el.vendorSelect.innerHTML =
      `<option value="all">全部厂商 (${sortedVendors.length})</option>` +
      sortedVendors
        .map(([vid, cnt]) => {
          const v = getVendor(vid);
          const label = v.nameZh && v.nameZh !== v.name ? `${v.name} · ${v.nameZh}` : v.name;
          return `<option value="${esc(vid)}" ${state.vendor === vid ? "selected" : ""}>${esc(label)} (${cnt})</option>`;
        })
        .join("");

    const topChips = sortedVendors.slice(0, 14);
    el.vendorRibbon.innerHTML =
      `<button class="vendor-chip ${state.vendor === "all" ? "active" : ""}" data-vendor="all" type="button">全部厂商</button>` +
      topChips
        .map(([vid, cnt]) => {
          const v = getVendor(vid);
          const img = v.icon
            ? `<img src="${esc(v.icon)}" alt="${esc(v.name)}" data-mono="${v.mono ? "true" : "false"}" loading="lazy" />`
            : "";
          return `
            <button class="vendor-chip ${state.vendor === vid ? "active" : ""}" data-vendor="${esc(vid)}" type="button">
              ${img}
              <span>${esc(v.name)}</span>
              <span class="mono" style="opacity:.6;font-size:.74rem">${cnt}</span>
            </button>
          `;
        })
        .join("");
  }

  function renderTable() {
    const track = getActiveTrack();
    const list = getFilteredAndSortedModels();
    const stats = computeColumnStats(track, list);
    const hasVotes = track.models.some((m) => m.votes != null);
    const cols = track.columns;

    const arrow = (key) => {
      if (state.sortKey !== key) return `<span class="sort-arrow">⇅</span>`;
      return `<span class="sort-arrow">${state.sortDir === "desc" ? "↓" : "↑"}</span>`;
    };

    const headCells = [
      `<th class="col-check" title="勾选最多 4 款模型进行雷达对比">对比</th>`,
      `<th class="col-rank">排名</th>`,
      `<th class="col-model">模型 &amp; 官方厂商</th>`,
    ];

    cols.forEach((col, idx) => {
      const sortedCls = state.sortKey === col.key ? "sorted" : "";
      const dirHint = col.lowerIsBetter ? "（越低越优，点击排序）" : "（越高越优，点击排序）";
      const titleTip = col.tooltip ? `${col.tooltip}${dirHint}` : dirHint.slice(1, -1);
      if (idx === 0) {
        headCells.push(`
          <th class="col-primary-score sortable ${sortedCls}" data-sort="${esc(col.key)}" title="${esc(titleTip)}">
            <span class="th-inner">${esc(col.label)} ${arrow(col.key)}</span>
          </th>
        `);
      } else {
        headCells.push(`
          <th class="th-right sortable ${sortedCls}" data-sort="${esc(col.key)}" title="${esc(titleTip)}">
            <span class="th-inner">${esc(col.label)} ${arrow(col.key)}</span>
          </th>
        `);
      }
    });

    if (hasVotes) {
      const sortedCls = state.sortKey === "votes" ? "sorted" : "";
      headCells.push(`
        <th class="th-right sortable ${sortedCls}" data-sort="votes">
          <span class="th-inner">盲测票数 ${arrow("votes")}</span>
        </th>
      `);
    }

    el.tableHead.innerHTML = `<tr>${headCells.join("")}</tr>`;

    if (list.length === 0) {
      el.tableBody.innerHTML = `
        <tr>
          <td colspan="${cols.length + (hasVotes ? 4 : 3)}" class="empty-state">
            没有符合当前筛选条件的模型，试试清空搜索词或切换厂商筛选。
          </td>
        </tr>
      `;
      el.tableFooter.innerHTML = `<span>共匹配 0 款模型</span>`;
      return;
    }

    const slice = list.slice(0, state.visibleCount);
    const primaryCol = cols[0];
    const pStat = stats[primaryCol.key];
    const pSpan = Math.max(0.01, pStat.max - pStat.min);

    el.tableBody.innerHTML = slice
      .map((m, i) => {
        const displayRank = i + 1;
        const rankCls =
          displayRank === 1 ? "rank-1" : displayRank === 2 ? "rank-2" : displayRank === 3 ? "rank-3" : "";
        const v = getVendor(m.vendor);
        const isCompared = state.compareIds.includes(m.id);

        const pVal = m.scores?.[primaryCol.key];
        let pct = 0;
        if (pVal != null) {
          const rawPct = primaryCol.lowerIsBetter
            ? ((pStat.max - pVal) / pSpan) * 100
            : ((pVal - pStat.min) / pSpan) * 100;
          pct = Math.max(6, Math.min(100, rawPct));
        }

        const subCells = cols
          .slice(1)
          .map((col) => {
            const val = m.scores?.[col.key];
            const isSortedCol = state.sortKey === col.key;
            if (val == null) {
              return `<td class="td-score ${isSortedCol ? "sorted-col" : ""}"><span class="dim-pill tier-empty">—</span></td>`;
            }
            const cStat = stats[col.key];
            let tier = "";
            if (col.lowerIsBetter) {
              if (val <= cStat.top5) tier = "tier-top";
              else if (val <= cStat.top15) tier = "tier-high";
            } else {
              if (val >= cStat.top5) tier = "tier-top";
              else if (val >= cStat.top15) tier = "tier-high";
            }
            return `
              <td class="td-score ${isSortedCol ? "sorted-col" : ""}">
                <span class="dim-pill ${tier}">${formatColValue(val, col)}</span>
              </td>
            `;
          })
          .join("");

        const votesCell = hasVotes ? `<td class="td-votes">${formatNumber(m.votes)}</td>` : "";

        return `
          <tr data-model-id="${esc(m.id)}" class="${isCompared ? "is-compared" : ""}">
            <td class="col-check">
              <input
                type="checkbox"
                class="compare-checkbox"
                data-compare-id="${esc(m.id)}"
                ${isCompared ? "checked" : ""}
                aria-label="选择 ${esc(m.name)} 加入对比"
              />
            </td>
            <td class="col-rank">
              <span class="rank-badge ${rankCls}">${displayRank}</span>
            </td>
            <td class="col-model">
              <div class="model-cell">
                ${renderVendorIconHtml(m.vendor)}
                <div class="model-meta">
                  <span class="model-name" title="${esc(m.name)}">${esc(m.name)}</span>
                  <span class="model-sub">
                    <span>${esc(v.name)}</span>
                    <span class="lic-tag ${m.isOpen ? "open" : "prop"}">${m.isOpen ? "开源" : "闭源"}</span>
                    ${m.contextLength ? `<span class="mono">${formatContext(m.contextLength)}</span>` : ""}
                  </span>
                </div>
              </div>
            </td>
            <td class="col-primary-score">
              <div class="primary-score-wrap">
                <div class="primary-score-top">
                  <span class="score-main">${formatColValue(pVal, primaryCol)}</span>
                  ${m.ci != null ? `<span class="score-ci" title="95% 置信区间">±${m.ci}</span>` : ""}
                </div>
                <div class="score-bar-track">
                  <div class="score-bar-fill" style="width:${pct.toFixed(1)}%"></div>
                </div>
              </div>
            </td>
            ${subCells}
            ${votesCell}
          </tr>
        `;
      })
      .join("");

    const remaining = list.length - slice.length;
    el.tableFooter.innerHTML = `
      <span>当前显示 <strong>${slice.length}</strong> / ${list.length} 款模型${track.supportsReleaseDedup && state.dedupRelease ? "（已开启「同模型仅保留最优」，取消勾选可展开同一模型的全部推理深度）" : ""} · 点击任意行查看多维档案</span>
      ${
        remaining > 0
          ? `<div style="display:flex;gap:8px;">
               <button id="btn-load-more" class="btn-ghost" type="button">展开更多 (+${Math.min(PAGE_STEP, remaining)})</button>
               <button id="btn-load-all" class="btn-ghost" type="button">显示全部 (${list.length})</button>
             </div>`
          : ""
      }
    `;

    const btnMore = document.getElementById("btn-load-more");
    const btnAll = document.getElementById("btn-load-all");
    if (btnMore) {
      btnMore.addEventListener("click", () => {
        state.visibleCount += PAGE_STEP;
        renderTable();
      });
    }
    if (btnAll) {
      btnAll.addEventListener("click", () => {
        state.visibleCount = list.length;
        renderTable();
      });
    }
  }

  /* ========================================================================
     Model Detail Drawer (with Effort Tiers & Cross-Track Lookup)
     ======================================================================== */

  function openModelDrawer(modelId) {
    const track = getActiveTrack();
    const model = track.models.find((m) => m.id === modelId);
    if (!model) return;
    state.activeDrawerModel = model;

    const v = getVendor(model.vendor);
    const stats = computeColumnStats(track);
    const primaryCol = track.columns[0];

    el.drawerTitleGroup.innerHTML = `
      ${renderVendorIconHtml(model.vendor, "lg")}
      <div>
        <h2 class="drawer-title">${esc(model.name)}</h2>
        <div class="drawer-subtitle">
          <span>${esc(v.name)}${v.nameZh && v.nameZh !== v.name ? ` · ${esc(v.nameZh)}` : ""}</span>
          <span class="lic-tag ${model.isOpen ? "open" : "prop"}">${esc(model.license)}</span>
          ${model.isReasoning ? `<span class="lic-tag" style="background:var(--accent-soft);color:var(--accent)">推理模型</span>` : ""}
        </div>
      </div>
    `;

    const priceStr =
      model.pricing && (model.pricing.input != null || model.pricing.output != null)
        ? `$${model.pricing.input} / $${model.pricing.output}`
        : "—";

    const kpiHtml = `
      <div class="drawer-kpi-grid">
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${esc(track.shortName)} 排名</div>
          <div class="drawer-kpi-val">#${model.rank}</div>
        </div>
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${esc(primaryCol.label)}</div>
          <div class="drawer-kpi-val">${formatColValue(model.score, primaryCol)}${model.ci != null ? `<span style="font-size:.75rem;color:var(--text-muted);font-weight:500"> ±${model.ci}</span>` : ""}</div>
        </div>
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${model.outputSpeed != null ? "输出速度" : model.votes != null ? "盲测票数" : "上下文"}</div>
          <div class="drawer-kpi-val">${model.outputSpeed != null ? `${Math.round(model.outputSpeed)} t/s` : model.votes != null ? formatNumber(model.votes) : formatContext(model.contextLength)}</div>
        </div>
      </div>
      ${
        model.contextLength || model.pricing || model.costPerTask != null
          ? `<div class="drawer-kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:-10px;">
               <div class="drawer-kpi">
                 <div class="drawer-kpi-label">上下文窗口</div>
                 <div class="drawer-kpi-val">${formatContext(model.contextLength)}</div>
               </div>
               <div class="drawer-kpi">
                 <div class="drawer-kpi-label">API 价 (入/出 /1M)</div>
                 <div class="drawer-kpi-val" style="font-size:.86rem">${esc(priceStr)}</div>
               </div>
               <div class="drawer-kpi">
                 <div class="drawer-kpi-label">${model.costPerTask != null ? "单任务成本" : "首字延迟"}</div>
                 <div class="drawer-kpi-val" style="font-size:.9rem">${model.costPerTask != null ? `$${Number(model.costPerTask).toFixed(2)}` : model.ttft != null ? `${Number(model.ttft).toFixed(2)}s` : "—"}</div>
               </div>
             </div>`
          : ""
      }
    `;

    // Dimension breakdown bars
    const barsHtml = track.columns
      .map((col) => {
        const val = model.scores?.[col.key];
        const st = stats[col.key];
        const span = Math.max(0.01, st.max - st.min);
        let pct = 0;
        if (val != null) {
          const raw = col.lowerIsBetter
            ? ((st.max - val) / span) * 100
            : ((val - st.min) / span) * 100;
          pct = Math.max(5, Math.min(100, raw));
        }
        return `
          <div class="dim-bar-row">
            <div class="dim-bar-head">
              <span>${esc(col.label)}${col.lowerIsBetter ? ` <span style="color:var(--text-muted);font-size:.75rem">(越低越优)</span>` : ""}</span>
              <span class="mono">${val != null ? formatColValue(val, col) : "暂无评测"}</span>
            </div>
            <div class="dim-bar-track">
              <div class="dim-bar-fill" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
        `;
      })
      .join("");

    // Sibling reasoning effort tiers of the same release (for AA tracks)
    let siblingsHtml = "";
    if (track.supportsReleaseDedup && model.releaseSlug) {
      const siblings = track.models.filter((x) => x.releaseSlug === model.releaseSlug);
      if (siblings.length > 1) {
        siblingsHtml = `
          <div>
            <h3 class="drawer-section-title">同系列不同思考档位对比 (${siblings.length} 档)</h3>
            <div class="cross-track-list">
              ${siblings
                .map(
                  (sb) => `
                  <div class="cross-track-item" data-open-sibling="${esc(sb.id)}" style="${sb.id === model.id ? "border-color:var(--accent);background:var(--accent-soft)" : ""}">
                    <span>${esc(sb.name)}</span>
                    <span class="mono">
                      <strong>${formatColValue(sb.score, primaryCol)}</strong>
                      ${sb.outputSpeed != null ? ` · ${Math.round(sb.outputSpeed)} t/s` : ""}
                      ${sb.costPerTask != null ? ` · $${Number(sb.costPerTask).toFixed(2)}/任务` : ""}
                    </span>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        `;
      }
    }

    // Cross-track appearances
    const normTarget = (model.releaseName || model.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const exactTarget = model.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const crossMatches = [];
    for (const [tid, t] of Object.entries(state.data.tracks)) {
      if (tid === track.id) continue;
      const found =
        t.models.find((x) => x.id === model.id) ||
        t.models.find((x) => x.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === exactTarget) ||
        t.models.find((x) => (x.releaseName || x.name).toLowerCase().replace(/[^a-z0-9]+/g, "") === normTarget);
      if (found) {
        crossMatches.push({ track: t, model: found });
      }
    }

    const crossHtml =
      crossMatches.length > 0
        ? `
          <div>
            <h3 class="drawer-section-title">跨赛道排名表现</h3>
            <div class="cross-track-list">
              ${crossMatches
                .map(
                  ({ track: ct, model: cm }) => `
                  <div class="cross-track-item" data-jump-track="${esc(ct.id)}">
                    <span>${esc(ct.name)}</span>
                    <span class="mono"><strong>#${cm.rank}</strong> · ${formatColValue(cm.score, ct.columns[0])}</span>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        `
        : "";

    el.drawerBody.innerHTML = `
      ${kpiHtml}
      <div>
        <h3 class="drawer-section-title">当前赛道多维指标分布</h3>
        <div class="dim-bar-list">${barsHtml}</div>
      </div>
      ${siblingsHtml}
      ${crossHtml}
    `;

    el.drawerBody.querySelectorAll("[data-open-sibling]").forEach((node) => {
      node.addEventListener("click", () => openModelDrawer(node.getAttribute("data-open-sibling")));
    });

    el.drawerBody.querySelectorAll("[data-jump-track]").forEach((node) => {
      node.addEventListener("click", () => {
        const targetTrack = node.getAttribute("data-jump-track");
        closeDrawer();
        switchTrack(targetTrack);
      });
    });

    const isCompared = state.compareIds.includes(model.id);
    el.drawerFooter.innerHTML = `
      <button id="drawer-toggle-compare" class="${isCompared ? "btn-ghost" : "btn-primary"}" type="button">
        ${isCompared ? "移出多维对比" : "加入多维雷达对比"}
      </button>
    `;

    document.getElementById("drawer-toggle-compare").addEventListener("click", () => {
      toggleCompare(model.id);
      openModelDrawer(model.id);
    });

    el.drawerBackdrop.classList.add("open");
    el.detailDrawer.classList.add("open");
    el.detailDrawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    el.drawerBackdrop.classList.remove("open");
    el.detailDrawer.classList.remove("open");
    el.detailDrawer.setAttribute("aria-hidden", "true");
    state.activeDrawerModel = null;
  }

  /* ========================================================================
     Multi-Model Comparison Dock & Radar Chart Modal
     ======================================================================== */

  function toggleCompare(modelId) {
    const idx = state.compareIds.indexOf(modelId);
    if (idx >= 0) {
      state.compareIds.splice(idx, 1);
    } else {
      if (state.compareIds.length >= 4) {
        showToast("最多同时对比 4 款模型");
        return;
      }
      state.compareIds.push(modelId);
    }
    renderTable();
    renderCompareDock();
  }

  function renderCompareDock() {
    const track = getActiveTrack();
    const models = state.compareIds
      .map((id) => track.models.find((m) => m.id === id))
      .filter(Boolean);

    if (models.length === 0) {
      el.compareDock.classList.remove("visible");
      return;
    }

    el.compareDockChips.innerHTML = models
      .map((m) => {
        const v = getVendor(m.vendor);
        const img = v.icon
          ? `<img src="${esc(v.icon)}" alt="${esc(v.name)}" data-mono="${v.mono ? "true" : "false"}" />`
          : "";
        return `
          <span class="dock-chip">
            ${img}
            <span>${esc(m.name)}</span>
            <button type="button" data-remove-compare="${esc(m.id)}" aria-label="移除 ${esc(m.name)}">×</button>
          </span>
        `;
      })
      .join("");

    el.btnOpenCompare.disabled = models.length < 2;
    el.btnOpenCompare.textContent = models.length < 2 ? "再选 1 款即可对比" : `对比这 ${models.length} 款模型`;
    el.compareDock.classList.add("visible");
  }

  function openCompareModal() {
    const track = getActiveTrack();
    const models = state.compareIds
      .map((id) => track.models.find((m) => m.id === id))
      .filter(Boolean);
    if (models.length < 2) {
      showToast("请至少勾选 2 款模型进行多维对比");
      return;
    }

    const stats = computeColumnStats(track);
    const cols = track.columns;
    // Plot capability dimensions (non-price) on radar if >= 3, else all columns
    const radarCols = cols.filter((c) => !c.lowerIsBetter && c.format !== "speed");
    const effectiveRadarCols = radarCols.length >= 3 ? radarCols.slice(0, 7) : cols.slice(0, 7);
    const canRadar = effectiveRadarCols.length >= 3;

    const tableRows = cols
      .map((col) => {
        const vals = models.map((m) => m.scores?.[col.key]);
        const numericVals = vals.filter((v) => v != null && !Number.isNaN(v));
        const bestVal = numericVals.length
          ? col.lowerIsBetter
            ? Math.min(...numericVals)
            : Math.max(...numericVals)
          : null;
        return `
          <tr>
            <td>${esc(col.label)}</td>
            ${vals
              .map((v) => {
                const isBest = v != null && bestVal != null && v === bestVal;
                return `<td class="mono ${isBest ? "compare-best" : ""}">${v != null ? formatColValue(v, col) : "—"}</td>`;
              })
              .join("")}
          </tr>
        `;
      })
      .join("");

    const legendHtml = models
      .map(
        (m, i) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${COMPARE_COLORS[i % COMPARE_COLORS.length]}"></span>
          <span>${esc(m.name)}</span>
        </span>
      `
      )
      .join("");

    el.compareModalBody.innerHTML = `
      <div class="compare-grid" style="${canRadar ? "" : "grid-template-columns:1fr"}">
        ${
          canRadar
            ? `<div class="radar-wrap">
                 <canvas id="radar-canvas" width="320" height="320" style="width:320px;height:320px"></canvas>
                 <div class="radar-legend">${legendHtml}</div>
               </div>`
            : ""
        }
        <div style="overflow-x:auto">
          <table class="compare-table">
            <thead>
              <tr>
                <th>评测维度</th>
                ${models
                  .map(
                    (m, i) => `
                    <th>
                      <span style="display:inline-flex;align-items:center;gap:5px;justify-content:flex-end">
                        <span class="legend-swatch" style="background:${COMPARE_COLORS[i % COMPARE_COLORS.length]}"></span>
                        <span>${esc(m.name)}</span>
                      </span>
                    </th>
                  `
                  )
                  .join("")}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>赛道排名</td>
                ${models.map((m) => `<td class="mono">#${m.rank}</td>`).join("")}
              </tr>
              <tr>
                <td>协议类型</td>
                ${models.map((m) => `<td>${esc(m.license)}</td>`).join("")}
              </tr>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    el.compareModal.classList.add("open");

    if (canRadar) {
      drawRadarChart(document.getElementById("radar-canvas"), effectiveRadarCols, models, stats);
    }
  }

  function drawRadarChart(canvas, cols, models, stats) {
    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(20,21,23,0.10)";
    const labelColor = isDark ? "#a1a7b5" : "#4b5563";

    const cx = size / 2;
    const cy = size / 2;
    const r = 104;
    const n = cols.length;

    for (let ring = 1; ring <= 4; ring++) {
      const rr = (r * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.font = '500 11px "Inter", "Noto Sans SC", sans-serif';
    ctx.fillStyle = labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      ctx.strokeStyle = gridColor;
      ctx.stroke();

      const lx = cx + Math.cos(ang) * (r + 24);
      const ly = cy + Math.sin(ang) * (r + 18);
      ctx.fillText(cols[i].label, lx, ly);
    }

    models.forEach((m, mi) => {
      const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const col = cols[i];
        const val = m.scores?.[col.key];
        const st = stats[col.key];
        const span = Math.max(0.01, st.max - st.min);
        let norm = 0.1;
        if (val != null) {
          const raw = col.lowerIsBetter ? (st.max - val) / span : (val - st.min) / span;
          norm = Math.max(0.12, Math.min(1, raw));
        }
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + Math.cos(ang) * (r * norm);
        const y = cy + Math.sin(ang) * (r * norm);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    });
  }

  /* ========================================================================
     Sources & Auto-Sync Info Modal
     ======================================================================== */

  function openSourcesModal() {
    if (!state.data) return;
    const meta = state.data.meta;
    const hash = meta.contentHash ? meta.contentHash.slice(0, 10) : "—";
    const edgeApi = getConfiguredEdgeApi();

    el.sourcesModalBody.innerHTML = `
      <div class="source-list">
        <div class="source-card">
          <div class="source-card-head">
            <span class="source-card-title">SWR (Stale-While-Revalidate) 刷新机制</span>
            <span class="mono" style="font-size:.8rem;color:var(--accent)">${esc(state.swrSource || "SWR")}</span>
          </div>
          <p>
            <strong>前端秒开 + 后台保鲜</strong>：打开页面先从本地 SWR 缓存毫秒级渲染，随后后台静默向 CDN / 边缘节点比对数据指纹（<code>${esc(hash)}</code>），切回标签页或网络恢复时也会自动按需校验，有新榜才静默更新。<br/>
            <strong>后端变更探测</strong>：GitHub Actions 每小时轻量探测上游变动，仅在真实分数或模型列表发生变化时自动发布新快照（无变化零构建）。另已内置 <code>worker/swr-worker.js</code> 支持一键部署 Cloudflare Edge SWR 节点。
          </p>
          <div class="source-card-links">
            <span>最新数据时间：<strong>${esc(formatDateTimeLocal(meta.generatedAt))}</strong></span>
            ${edgeApi ? `<span>已挂载边缘节点：<code>${esc(edgeApi)}</code></span>` : ""}
            <a href="${REPO_URL}/actions" target="_blank" rel="noopener">查看探测与部署日志 ↗</a>
          </div>
        </div>

        ${meta.sources
          .map(
            (s) => `
            <div class="source-card">
              <div class="source-card-head">
                <span class="source-card-title">${esc(s.name)}</span>
                <span class="mono" style="font-size:.78rem;color:var(--text-muted)">权威公开源</span>
              </div>
              <p>${esc(s.description)}</p>
              <div class="source-card-links">
                <a href="${esc(s.url)}" target="_blank" rel="noopener">官方榜单 ↗</a>
                <a href="${esc(s.datasetUrl)}" target="_blank" rel="noopener">评测方法 / 原始数据集 ↗</a>
              </div>
            </div>
          `
          )
          .join("")}

        <div class="source-card">
          <div class="source-card-head">
            <span class="source-card-title">官方厂商图标来源</span>
            <span class="mono" style="font-size:.78rem;color:var(--text-muted)">0 自绘图标</span>
          </div>
          <p>
            所有厂商图标 100% 源自官方公开图标资产（<code>@lobehub/icons-static-svg</code>、<code>Simple Icons</code> 与 Artificial Analysis 官方厂商 Logo 库），绝不手绘伪造。
          </p>
        </div>
      </div>
    `;
    el.sourcesModal.classList.add("open");
  }

  /* ========================================================================
     Navigation & Event Wiring
     ======================================================================== */

  function switchTrack(trackId) {
    if (!state.data?.tracks?.[trackId]) return;
    state.trackId = trackId;
    const primary = state.data.tracks[trackId].columns[0];
    state.sortKey = primary.key;
    state.sortDir = primary.lowerIsBetter ? "asc" : "desc";
    state.visibleCount = PAGE_STEP;
    state.compareIds = [];
    history.replaceState(null, "", `#${trackId}`);
    renderAll();
    updateSyncStatus();
  }

  function bindEvents() {
    el.btnTheme.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });

    el.btnRefresh.addEventListener("click", () => revalidateSwr({ force: true, silent: false }));
    el.btnSources.addEventListener("click", openSourcesModal);

    el.trackTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-track]");
      if (!btn) return;
      switchTrack(btn.getAttribute("data-track"));
    });

    el.searchInput.addEventListener("input", () => {
      state.search = el.searchInput.value;
      el.searchClear.classList.toggle("visible", state.search.length > 0);
      state.visibleCount = PAGE_STEP;
      renderTable();
    });

    el.searchClear.addEventListener("click", () => {
      state.search = "";
      el.searchInput.value = "";
      el.searchClear.classList.remove("visible");
      renderTable();
      el.searchInput.focus();
    });

    document.querySelectorAll(".seg-btn[data-license]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".seg-btn[data-license]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.license = btn.getAttribute("data-license");
        state.visibleCount = PAGE_STEP;
        renderTable();
      });
    });

    el.vendorSelect.addEventListener("change", () => {
      state.vendor = el.vendorSelect.value;
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    el.vendorRibbon.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-vendor]");
      if (!chip) return;
      state.vendor = chip.getAttribute("data-vendor");
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    el.dedupRelease.addEventListener("change", () => {
      state.dedupRelease = el.dedupRelease.checked;
      el.dedupReleaseWrap.classList.toggle("active", state.dedupRelease);
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    el.flagshipOnly.addEventListener("change", () => {
      state.flagshipOnly = el.flagshipOnly.checked;
      el.flagshipWrap.classList.toggle("active", state.flagshipOnly);
      state.visibleCount = PAGE_STEP;
      renderTable();
    });

    el.tableHead.addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      const col = getActiveTrack().columns.find((c) => c.key === key);
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortKey = key;
        state.sortDir = col?.lowerIsBetter ? "asc" : "desc";
      }
      renderTable();
    });

    el.tableBody.addEventListener("click", (e) => {
      const cb = e.target.closest(".compare-checkbox");
      if (cb) {
        e.stopPropagation();
        toggleCompare(cb.getAttribute("data-compare-id"));
        return;
      }
      const tr = e.target.closest("tr[data-model-id]");
      if (!tr) return;
      openModelDrawer(tr.getAttribute("data-model-id"));
    });

    el.drawerClose.addEventListener("click", closeDrawer);
    el.drawerBackdrop.addEventListener("click", closeDrawer);

    el.compareDockChips.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-remove-compare]");
      if (!rm) return;
      toggleCompare(rm.getAttribute("data-remove-compare"));
    });
    el.btnClearCompare.addEventListener("click", () => {
      state.compareIds = [];
      renderTable();
      renderCompareDock();
    });
    el.btnOpenCompare.addEventListener("click", openCompareModal);

    el.compareModalClose.addEventListener("click", () => el.compareModal.classList.remove("open"));
    el.compareModal.addEventListener("click", (e) => {
      if (e.target === el.compareModal) el.compareModal.classList.remove("open");
    });

    el.sourcesModalClose.addEventListener("click", () => el.sourcesModal.classList.remove("open"));
    el.sourcesModal.addEventListener("click", (e) => {
      if (e.target === el.sourcesModal) el.sourcesModal.classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDrawer();
        el.compareModal.classList.remove("open");
        el.sourcesModal.classList.remove("open");
      }
    });

    window.addEventListener("hashchange", () => {
      const hashTrack = location.hash.replace(/^#/, "");
      if (hashTrack && state.data?.tracks?.[hashTrack] && hashTrack !== state.trackId) {
        switchTrack(hashTrack);
      }
    });

    // SWR Focus & Network Reconnect Revalidation
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        revalidateSwr({ force: false, silent: true });
      }
    });

    window.addEventListener("online", () => {
      revalidateSwr({ force: false, silent: true });
    });
  }

  async function boot() {
    initTheme();
    bindEvents();

    // 1. Stale: Paint immediately from localStorage SWR cache if available
    const cached = readSwrCache();
    if (cached) {
      applyPayload(cached);
    }

    // 2. While-Revalidate: Silently check latest CDN/Edge snapshot right away
    await revalidateSwr({ force: false, silent: Boolean(cached) });

    if (!state.data) {
      el.tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="empty-state">
            加载排行榜数据失败，请点击右上角「刷新排行」重试。
          </td>
        </tr>
      `;
    }

    state.statusTimer = setInterval(updateSyncStatus, 60_000);
  }

  boot();
})();
