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
    paretoOnly: false,
    paretoMode: "priceBlended", // priceBlended | costPerTask | outputSpeed
    paretoScale: "log", // log | linear
    vendorRibbonExpanded: false,
    visibleCount: PAGE_STEP,
    compareIds: [],
    activeDrawerModel: null,
    displayRankMap: null,
    activeRadarArgs: null,
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
    paretoOnly: document.getElementById("pareto-only"),
    paretoOnlyWrap: document.getElementById("pareto-only-wrap"),
    paretoSection: document.getElementById("pareto-section"),
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
    themeSwitcher: document.getElementById("theme-switcher"),
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
     Theme Management (light | dark | auto, persisted safely)
     ======================================================================== */

  const THEME_STORAGE_KEY = "modelrank_theme_mode";
  const themeMediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let currentThemeMode = "auto";

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch {
      // Ignore storage restrictions in privacy/sandboxed modes
    }
  }

  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return themeMediaQuery && themeMediaQuery.matches ? "dark" : "light";
  }

  function applyThemeMode(mode, persist = true) {
    const normalized = mode === "light" || mode === "dark" || mode === "auto" ? mode : "auto";
    currentThemeMode = normalized;
    const resolved = resolveTheme(normalized);

    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-mode", normalized);

    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute("content", normalized === "auto" ? "light dark" : resolved);
    }

    if (persist) {
      safeStorageSet(THEME_STORAGE_KEY, normalized);
      safeStorageSet("modelrank_theme", normalized);
    }

    if (el.themeSwitcher) {
      el.themeSwitcher.querySelectorAll(".theme-btn").forEach((btn) => {
        const isActive = btn.getAttribute("data-theme-mode") === normalized;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
      });
    }

    // Re-render open radar canvas so gridlines & labels match new theme immediately
    if (el.compareModal?.classList.contains("open") && state.activeRadarArgs) {
      const canvas = document.getElementById("radar-canvas");
      if (canvas) {
        drawRadarChart(canvas, ...state.activeRadarArgs);
      }
    }
  }

  function initTheme() {
    const saved = safeStorageGet(THEME_STORAGE_KEY) || safeStorageGet("modelrank_theme");
    const mode = saved === "light" || saved === "dark" || saved === "auto" ? saved : "auto";
    applyThemeMode(mode, false);

    if (themeMediaQuery) {
      const onSystemChange = () => {
        if (currentThemeMode === "auto") {
          applyThemeMode("auto", false);
        }
      };
      if (typeof themeMediaQuery.addEventListener === "function") {
        themeMediaQuery.addEventListener("change", onSystemChange);
      } else if (typeof themeMediaQuery.addListener === "function") {
        themeMediaQuery.addListener(onSystemChange);
      }
    }
  }

  /* ========================================================================
     SWR (Stale-While-Revalidate) Data Engine
     1. Stale: Immediately hydrates from localStorage cache in <5ms
     2. Revalidate: Parallel timeout-protected check across Pages / CDN / Edge Worker, picking newest generatedAt
     3. Focus & Online Revalidation: Refreshes automatically when returning to tab
     ======================================================================== */

  function getConfiguredEdgeApi() {
    const param = new URLSearchParams(location.search).get("api");
    if (param && /^https?:\/\//i.test(param)) {
      safeStorageSet(SWR_EDGE_KEY, param);
      return param;
    }
    return safeStorageGet(SWR_EDGE_KEY) || "";
  }

  function readSwrCache() {
    try {
      const raw = safeStorageGet(SWR_CACHE_KEY);
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
      safeStorageSet(SWR_CACHE_KEY, JSON.stringify(json));
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

  async function fetchJsonWithTimeout(url, force, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        cache: force ? "no-store" : "default",
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (!json?.tracks || !json?.meta) throw new Error("Invalid payload");
      return json;
    } finally {
      clearTimeout(timer);
    }
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
      // Race same-origin GitHub Pages snapshot + Fastly GitHub Raw CDN in parallel; pick the newest valid snapshot
      candidates.push({
        label: "Pages 站点快照",
        url: force ? `${LOCAL_DATA_URL}?t=${Date.now()}` : LOCAL_DATA_URL,
      });
      candidates.push({
        label: "GitHub CDN (SWR)",
        url: force ? `${REMOTE_CDN_URL}?t=${Date.now()}` : REMOTE_CDN_URL,
      });
    }

    const pickBest = (list) => {
      list.sort((a, b) => {
        const ta = Date.parse(a.json.meta?.generatedAt || 0) || 0;
        const tb = Date.parse(b.json.meta?.generatedAt || 0) || 0;
        return tb - ta;
      });
      return list[0];
    };

    return await new Promise((resolve, reject) => {
      const successes = [];
      let firstErr = null;
      let settledCount = 0;
      let resolved = false;
      let graceTimer = null;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (graceTimer) clearTimeout(graceTimer);
        if (successes.length > 0) {
          resolve(pickBest(successes));
        } else {
          reject(firstErr || new Error("所有数据源均不可达"));
        }
      };

      candidates.forEach((c) => {
        fetchJsonWithTimeout(c.url, force, 6000)
          .then((json) => {
            successes.push({ json, source: c.label });
            if (successes.length === 1 && candidates.length > 1 && !graceTimer) {
              // Allow up to 1.2s for peer endpoints to respond with a newer snapshot; never stall 6s on a blocked CDN
              graceTimer = setTimeout(finish, 1200);
            }
          })
          .catch((err) => {
            if (!firstErr) firstErr = err;
          })
          .finally(() => {
            settledCount += 1;
            if (settledCount === candidates.length) {
              finish();
            }
          });
      });
    });
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
      const prevHash = state.data?.meta?.contentHash || "";
      const prevTime = Date.parse(state.data?.meta?.generatedAt || 0) || 0;
      const { json, source } = await fetchFromBestEndpoint(force);
      state.lastRevalidatedAt = Date.now();
      state.swrSource = source;

      const nextHash = json.meta?.contentHash || json.meta?.generatedAt || "";
      const nextTime = Date.parse(json.meta?.generatedAt || 0) || 0;
      const isNotOlder = nextTime >= prevTime;
      const hasNewer = !state.data || (isNotOlder && (nextHash !== prevHash || nextTime > prevTime));

      if (hasNewer) {
        writeSwrCache(json);
        applyPayload(json);
        if (prevHash && nextHash !== prevHash) {
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
     Pareto Frontier Engine & Interactive Scatter Plot
     ======================================================================== */

  const PARETO_MODES = {
    priceBlended: {
      key: "priceBlended",
      shortLabel: "综合价 $/1M",
      title: "智力指数 vs 综合 API 价格 ($/1M Tokens)",
      axisLabel: "综合 API 价格 ($/1M Tokens，越左越省钱 ←)",
      lowerIsBetter: true,
      defaultScale: "log",
      format: "usd",
      unitNote: "按输入:输出 3:1 加权，仅统计公开有效 API 报价 (>$0) 模型",
    },
    costPerTask: {
      key: "costPerTask",
      shortLabel: "单任务成本 $/Task",
      title: "智力指数 vs 单任务实际成本 ($/Task，含推理思考 Token)",
      axisLabel: "单任务平均花费 ($/Task，越左越省钱 ←)",
      lowerIsBetter: true,
      defaultScale: "log",
      format: "usdTask",
      unitNote: "Artificial Analysis 实测单任务总花费（含思考链 Token 消耗，>$0）",
    },
    outputSpeed: {
      key: "outputSpeed",
      shortLabel: "输出速度 tok/s",
      title: "智力指数 vs 实测输出速度 (Tokens/s)",
      axisLabel: "实测输出速度 (Tokens/s，越右越快 →)",
      lowerIsBetter: false,
      defaultScale: "linear",
      format: "speed",
      unitNote: "同时在「更聪明」与「更快」两个维度上无严格更优替代的模型前沿",
    },
  };

  function supportsPareto(track) {
    return Boolean(track && (track.id === "aa_intelligence" || track.isParetoTrack));
  }

  function getActiveParetoModeKey(track) {
    if (track?.isParetoTrack) return state.paretoMode;
    return "priceBlended";
  }

  function getModelParetoVal(model, key) {
    if (model.scores && model.scores[key] != null) return Number(model.scores[key]);
    if (model[key] != null) return Number(model[key]);
    return null;
  }

  function computeParetoFrontier(models, modeKey) {
    const cfg = PARETO_MODES[modeKey] || PARETO_MODES.priceBlended;
    const valid = [];
    for (const m of models) {
      const y = getModelParetoVal(m, "intelligenceIndex");
      const x = getModelParetoVal(m, cfg.key);
      if (y == null || x == null || Number.isNaN(y) || Number.isNaN(x)) continue;
      if (x <= 0) continue; // Exclude unpriced ($0) or 0-speed models from frontier math
      valid.push({ model: m, x, y });
    }

    const frontier = [];
    const frontierSet = new Set();

    if (cfg.lowerIsBetter) {
      // Lower X is better, Higher Y is better
      valid.sort((a, b) => (a.x !== b.x ? a.x - b.x : b.y - a.y));
      let bestY = -Infinity;
      let lastX = null;
      for (const pt of valid) {
        if (pt.y > bestY + 1e-9 || (lastX !== null && Math.abs(pt.x - lastX) < 1e-9 && Math.abs(pt.y - bestY) < 1e-9)) {
          frontier.push(pt);
          frontierSet.add(pt.model.id);
          if (pt.y > bestY) {
            bestY = pt.y;
            lastX = pt.x;
          }
        }
      }
    } else {
      // Higher X is better, Higher Y is better
      valid.sort((a, b) => (a.x !== b.x ? b.x - a.x : b.y - a.y));
      let bestY = -Infinity;
      let lastX = null;
      for (const pt of valid) {
        if (pt.y > bestY + 1e-9 || (lastX !== null && Math.abs(pt.x - lastX) < 1e-9 && Math.abs(pt.y - bestY) < 1e-9)) {
          frontier.push(pt);
          frontierSet.add(pt.model.id);
          if (pt.y > bestY) {
            bestY = pt.y;
            lastX = pt.x;
          }
        }
      }
      frontier.sort((a, b) => a.x - b.x);
    }

    // For every dominated point, identify the strongest frontier model dominating it
    const dominatorMap = new Map();
    for (const pt of valid) {
      if (frontierSet.has(pt.model.id)) continue;
      let bestDom = null;
      for (const f of frontier) {
        const xBetterOrEq = cfg.lowerIsBetter ? f.x <= pt.x + 1e-9 : f.x >= pt.x - 1e-9;
        const yBetterOrEq = f.y >= pt.y - 1e-9;
        const strictlyBetter = (cfg.lowerIsBetter ? f.x < pt.x - 1e-9 : f.x > pt.x + 1e-9) || f.y > pt.y + 1e-9;
        if (xBetterOrEq && yBetterOrEq && strictlyBetter) {
          if (!bestDom || f.y > bestDom.y) bestDom = f;
        }
      }
      if (bestDom) dominatorMap.set(pt.model.id, bestDom);
    }

    return { cfg, valid, frontier, frontierSet, dominatorMap };
  }

  function niceLogTicks(minVal, maxVal) {
    const candidates = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const picked = candidates.filter((v) => v >= minVal * 0.92 && v <= maxVal * 1.08);
    if (picked.length >= 3) return picked;
    const lo = Math.floor(Math.log10(minVal));
    const hi = Math.ceil(Math.log10(maxVal));
    const out = [];
    for (let p = lo; p <= hi; p++) {
      const v = Math.pow(10, p);
      if (v >= minVal * 0.85 && v <= maxVal * 1.15) out.push(v);
    }
    return out.length ? out : [minVal, maxVal];
  }

  function niceLinearTicks(minVal, maxVal, count = 5) {
    const span = Math.max(1e-6, maxVal - minVal);
    const rawStep = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10) * mag;
    const start = Math.ceil(minVal / step) * step;
    const ticks = [];
    for (let v = start; v <= maxVal + step * 0.01; v += step) {
      ticks.push(Number(v.toFixed(4)));
    }
    return ticks;
  }

  function formatAxisTick(val, fmt) {
    if (fmt === "usd" || fmt === "usdTask") {
      if (val >= 10) return `$${Math.round(val)}`;
      if (val >= 1) return `$${Number(val.toFixed(1))}`;
      return `$${Number(val.toFixed(2))}`;
    }
    if (fmt === "speed") return `${Math.round(val)}`;
    return `${Math.round(val)}`;
  }

  function renderParetoPanel(pareto) {
    const track = getActiveTrack();
    if (!track.isParetoTrack) {
      el.paretoSection.style.display = "none";
      return;
    }
    el.paretoSection.style.display = "block";

    const { cfg, valid, frontier, frontierSet, dominatorMap } = pareto;
    const modeButtons = Object.values(PARETO_MODES)
      .map(
        (m) => `
        <button class="seg-btn ${state.paretoMode === m.key ? "active" : ""}" data-pareto-mode="${esc(m.key)}" type="button">
          ${esc(m.shortLabel)}
        </button>
      `
      )
      .join("");

    el.paretoSection.innerHTML = `
      <div class="pareto-header">
        <div class="pareto-controls">
          <div class="segmented" role="group" aria-label="帕累托横轴维度切换">${modeButtons}</div>
          <div class="segmented" role="group" aria-label="坐标刻度切换">
            <button class="seg-btn ${state.paretoScale === "log" ? "active" : ""}" data-pareto-scale="log" type="button">对数坐标</button>
            <button class="seg-btn ${state.paretoScale === "linear" ? "active" : ""}" data-pareto-scale="linear" type="button">线性坐标</button>
          </div>
        </div>
        <div class="pareto-meta">
          <span class="pareto-legend-item"><span class="pareto-line-sample"></span><strong>${frontier.length}</strong> 款帕累托前沿模型</span>
          <span class="pareto-legend-item"><span class="pareto-dot-sample"></span>其余 ${Math.max(0, valid.length - frontier.length)} 款候选模型</span>
        </div>
      </div>
      <div class="pareto-stage" id="pareto-stage">
        <svg class="pareto-svg" id="pareto-svg" aria-label="${esc(cfg.title)}"></svg>
        <div class="pareto-overlay" id="pareto-overlay"></div>
        <div class="pareto-tooltip" id="pareto-tooltip" role="tooltip"></div>
      </div>
      <div class="pareto-foot-note">
        <span>${esc(cfg.unitNote)} · 拥挤处未展开的名称悬浮图标即可查看，点击任意点打开详情。</span>
        <span>前沿线随「仅开源 / 厂商 / 同模型仅保留最优」筛选实时重算</span>
      </div>
    `;

    el.paretoSection.querySelectorAll("[data-pareto-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextMode = btn.getAttribute("data-pareto-mode");
        state.paretoMode = nextMode;
        state.paretoScale = PARETO_MODES[nextMode].defaultScale;
        renderAll();
      });
    });

    el.paretoSection.querySelectorAll("[data-pareto-scale]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.paretoScale = btn.getAttribute("data-pareto-scale");
        renderAll();
      });
    });

    const stage = document.getElementById("pareto-stage");
    const svg = document.getElementById("pareto-svg");
    const overlay = document.getElementById("pareto-overlay");
    const tooltip = document.getElementById("pareto-tooltip");

    if (valid.length === 0) {
      overlay.innerHTML = `<div class="empty-state" style="padding-top:150px">当前筛选条件下暂无具备有效「${esc(cfg.shortLabel)}」数据的模型，请放宽筛选条件。</div>`;
      return;
    }

    const rect = stage.getBoundingClientRect();
    const width = Math.max(320, rect.width || 960);
    const height = Math.max(280, rect.height || 410);
    const pad = { top: 26, right: 32, bottom: 48, left: 56 };
    const plotW = Math.max(120, width - pad.left - pad.right);
    const plotH = Math.max(120, height - pad.top - pad.bottom);

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Compute domains with crisp breathing room
    const xs = valid.map((p) => p.x);
    const ys = valid.map((p) => p.y);
    const rawMinX = Math.min(...xs);
    const rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);

    const isLog = state.paretoScale === "log";
    const domMinX = isLog ? rawMinX * 0.82 : Math.max(0, rawMinX - (rawMaxX - rawMinX) * 0.06);
    const domMaxX = isLog ? rawMaxX * 1.24 : rawMaxX + Math.max(1, rawMaxX - rawMinX) * 0.08;
    const domMinY = Math.max(0, Math.floor((rawMinY - 4) / 5) * 5);
    const domMaxY = Math.min(100, Math.ceil((rawMaxY + 4) / 5) * 5);

    const mapX = (x) => {
      if (isLog) {
        const lMin = Math.log10(Math.max(1e-4, domMinX));
        const lMax = Math.log10(Math.max(domMinX * 1.1, domMaxX));
        return pad.left + ((Math.log10(Math.max(1e-4, x)) - lMin) / Math.max(1e-6, lMax - lMin)) * plotW;
      }
      return pad.left + ((x - domMinX) / Math.max(1e-6, domMaxX - domMinX)) * plotW;
    };

    const mapY = (y) => pad.top + plotH - ((y - domMinY) / Math.max(1e-6, domMaxY - domMinY)) * plotH;

    const xTicks = isLog ? niceLogTicks(domMinX, domMaxX) : niceLinearTicks(domMinX, domMaxX, 5);
    const yTicks = niceLinearTicks(domMinY, domMaxY, 5);

    const svgParts = [];

    // Gridlines & ticks
    for (const yv of yTicks) {
      const py = mapY(yv);
      if (py < pad.top - 2 || py > pad.top + plotH + 2) continue;
      svgParts.push(`<line class="pareto-grid-line" x1="${pad.left}" y1="${py.toFixed(1)}" x2="${pad.left + plotW}" y2="${py.toFixed(1)}" />`);
      svgParts.push(`<text class="pareto-tick-label" x="${pad.left - 8}" y="${(py + 3.5).toFixed(1)}" text-anchor="end">${Math.round(yv)}</text>`);
    }
    for (const xv of xTicks) {
      const px = mapX(xv);
      if (px < pad.left - 2 || px > pad.left + plotW + 2) continue;
      svgParts.push(`<line class="pareto-grid-line" x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" />`);
      svgParts.push(`<text class="pareto-tick-label" x="${px.toFixed(1)}" y="${(pad.top + plotH + 17).toFixed(1)}" text-anchor="middle">${esc(formatAxisTick(xv, cfg.format))}</text>`);
    }

    // Axes lines & titles
    svgParts.push(`<line class="pareto-axis-line" x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" />`);
    svgParts.push(`<line class="pareto-axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" />`);
    svgParts.push(`<text class="pareto-axis-title" x="${(pad.left + plotW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${esc(cfg.axisLabel)}</text>`);
    svgParts.push(`<text class="pareto-axis-title" transform="translate(16 ${(pad.top + plotH / 2).toFixed(1)}) rotate(-90)" text-anchor="middle">智力指数 (AA Index ↑)</text>`);

    // Pareto frontier shaded envelope + crisp polyline
    if (frontier.length >= 2) {
      const pts = frontier.map((p) => `${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`);
      const firstX = mapX(frontier[0].x).toFixed(1);
      const lastX = mapX(frontier[frontier.length - 1].x).toFixed(1);
      const baseY = (pad.top + plotH).toFixed(1);
      const polyPts = `${firstX},${baseY} ${pts.join(" ")} ${lastX},${baseY}`;
      svgParts.push(`<polygon class="pareto-envelope" points="${polyPts}" />`);
      svgParts.push(`<polyline class="pareto-frontier-line" points="${pts.join(" ")}" />`);
    }

    // Non-frontier scatter dots (dimmed slightly when paretoOnly is active)
    const dotOpacityAttr = state.paretoOnly ? ' style="opacity:0.18"' : "";
    for (const pt of valid) {
      if (frontierSet.has(pt.model.id)) continue;
      const cx = mapX(pt.x).toFixed(1);
      const cy = mapY(pt.y).toFixed(1);
      const openCls = pt.model.isOpen ? " is-open" : "";
      svgParts.push(
        `<circle class="pareto-dot${openCls}" cx="${cx}" cy="${cy}" r="5.5" data-dot-id="${esc(pt.model.id)}"${dotOpacityAttr} />`
      );
    }

    svg.innerHTML = svgParts.join("");

    // HTML Overlay: Official Vendor Logo Badges for Pareto Frontier + Collision-Avoided Labels
    const placedBoxes = [];
    const collides = (box) =>
      placedBoxes.some(
        (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
      );

    // Reserve node icon circles first so labels never cover another frontier vendor icon
    const frontierCoords = frontier.map((pt) => {
      const px = mapX(pt.x);
      const py = mapY(pt.y);
      placedBoxes.push({ x1: px - 15, y1: py - 15, x2: px + 15, y2: py + 15 });
      return { ...pt, px, py };
    });

    const overlayParts = [];
    // Sort label placement priority: highest intelligence models get first pick of label positions
    const labelOrder = [...frontierCoords].sort((a, b) => b.y - a.y);
    const labelPlacements = new Map();

    for (const pt of labelOrder) {
      const shortLbl = pt.model.name.length > 22 ? `${pt.model.name.slice(0, 21)}…` : pt.model.name;
      const scoreTxt = formatColValue(pt.y, { format: "index" });
      const estW = Math.min(205, shortLbl.length * 6.8 + scoreTxt.length * 6.8 + 18);
      const estH = 22;

      const candidates = cfg.lowerIsBetter
        ? [
            { x: pt.px - estW - 19, y: pt.py - estH / 2 }, // left
            { x: pt.px - estW - 8, y: pt.py - estH - 19 }, // top-left
            { x: pt.px - estW / 2, y: pt.py - estH - 19 }, // above
            { x: pt.px + 19, y: pt.py - estH / 2 }, // right
            { x: pt.px - estW - 8, y: pt.py + 19 }, // bottom-left
            { x: pt.px + 8, y: pt.py + 19 }, // bottom-right
            { x: pt.px - estW / 2, y: pt.py + 19 }, // below
          ]
        : [
            { x: pt.px + 19, y: pt.py - estH / 2 }, // right
            { x: pt.px + 8, y: pt.py - estH - 19 }, // top-right
            { x: pt.px - estW / 2, y: pt.py - estH - 19 }, // above
            { x: pt.px - estW - 19, y: pt.py - estH / 2 }, // left
            { x: pt.px - estW - 8, y: pt.py + 19 }, // bottom-left
            { x: pt.px + 8, y: pt.py + 19 }, // bottom-right
            { x: pt.px - estW / 2, y: pt.py + 19 }, // below
          ];

      for (const cand of candidates) {
        const box = {
          x1: cand.x - 3,
          y1: cand.y - 2,
          x2: cand.x + estW + 3,
          y2: cand.y + estH + 2,
        };
        const inside =
          box.x1 >= pad.left - 8 &&
          box.x2 <= width - 6 &&
          box.y1 >= 4 &&
          box.y2 <= pad.top + plotH - 2;
        if (inside && !collides(box)) {
          placedBoxes.push(box);
          labelPlacements.set(pt.model.id, { x: cand.x, y: cand.y, shortLbl, scoreTxt });
          break;
        }
      }
    }

    for (const pt of frontierCoords) {
      const v = getVendor(pt.model.vendor);
      const img = v.icon
        ? `<img src="${esc(v.icon)}" alt="${esc(v.name)}" data-mono="${v.mono ? "true" : "false"}" />`
        : `<span class="vendor-fallback-text">${esc(v.name.slice(0, 2))}</span>`;

      overlayParts.push(`
        <button
          class="pareto-node"
          type="button"
          style="left:${pt.px.toFixed(1)}px;top:${pt.py.toFixed(1)}px"
          data-node-id="${esc(pt.model.id)}"
          aria-label="${esc(pt.model.name)}（帕累托最优）"
        >${img}</button>
      `);

      const lp = labelPlacements.get(pt.model.id);
      if (lp) {
        overlayParts.push(`
          <div class="pareto-node-label" style="left:${lp.x.toFixed(1)}px;top:${lp.y.toFixed(1)}px">
            ${esc(lp.shortLbl)}<span class="mono">${esc(lp.scoreTxt)}</span>
          </div>
        `);
      }
    }

    overlay.innerHTML = overlayParts.join("");

    // Interactive Hover Tooltip & Click-to-Drawer for BOTH dots and frontier nodes
    const ptById = new Map(valid.map((p) => [p.model.id, p]));

    function showPointTooltip(modelId, px, py) {
      const pt = ptById.get(modelId);
      if (!pt) return;
      const m = pt.model;
      const v = getVendor(m.vendor);
      const isFrontier = frontierSet.has(m.id);
      const dom = dominatorMap.get(m.id);

      const priceVal = getModelParetoVal(m, "priceBlended");
      const taskVal = getModelParetoVal(m, "costPerTask");
      const speedVal = getModelParetoVal(m, "outputSpeed");

      const statusHtml = isFrontier
        ? `<strong>★ 帕累托最优前沿</strong> · 当前筛选下同档位无更优替代`
        : dom
          ? `同档位更优参考：<strong>${esc(dom.model.name)}</strong>（智力 ${formatColValue(dom.y, { format: "index" })} / ${formatColValue(dom.x, { format: cfg.format })}）`
          : `非前沿候选模型`;

      tooltip.innerHTML = `
        <div class="pareto-tt-head">
          ${renderVendorIconHtml(m.vendor, "sm")}
          <div>
            <div class="pareto-tt-name">${esc(m.name)}</div>
            <div class="pareto-tt-vendor">${esc(v.name)} · ${m.isOpen ? "开源权重" : "闭源商业"}</div>
          </div>
        </div>
        <div class="pareto-tt-metrics">
          <div class="pareto-tt-kv"><span class="pareto-tt-k">智力指数</span><span class="pareto-tt-v">${formatColValue(pt.y, { format: "index" })}</span></div>
          <div class="pareto-tt-kv"><span class="pareto-tt-k">综合价</span><span class="pareto-tt-v">${priceVal != null ? formatColValue(priceVal, { format: "usd" }) : "—"}</span></div>
          <div class="pareto-tt-kv"><span class="pareto-tt-k">单任务</span><span class="pareto-tt-v">${taskVal != null ? formatColValue(taskVal, { format: "usdTask" }) : "—"}</span></div>
          <div class="pareto-tt-kv"><span class="pareto-tt-k">速度</span><span class="pareto-tt-v">${speedVal != null ? `${Math.round(speedVal)} t/s` : "—"}</span></div>
        </div>
        <div class="pareto-tt-status">${statusHtml}</div>
      `;

      // Position smartly inside stage bounds
      const ttW = 265;
      const ttH = 152;
      const left = px + 18 + ttW > width ? Math.max(8, px - ttW - 18) : px + 18;
      const top = Math.max(8, Math.min(height - ttH - 8, py - ttH / 2));
      tooltip.style.left = `${left.toFixed(1)}px`;
      tooltip.style.top = `${top.toFixed(1)}px`;
      tooltip.classList.add("visible");
    }

    function hideTooltip() {
      tooltip.classList.remove("visible");
    }

    svg.querySelectorAll("[data-dot-id]").forEach((dot) => {
      const id = dot.getAttribute("data-dot-id");
      const cx = Number(dot.getAttribute("cx"));
      const cy = Number(dot.getAttribute("cy"));
      dot.addEventListener("mouseenter", () => showPointTooltip(id, cx, cy));
      dot.addEventListener("mouseleave", hideTooltip);
      dot.addEventListener("click", () => openModelDrawer(id));
    });

    overlay.querySelectorAll("[data-node-id]").forEach((node) => {
      const id = node.getAttribute("data-node-id");
      const px = parseFloat(node.style.left);
      const py = parseFloat(node.style.top);
      node.addEventListener("mouseenter", () => showPointTooltip(id, px, py));
      node.addEventListener("mouseleave", hideTooltip);
      node.addEventListener("focus", () => showPointTooltip(id, px, py));
      node.addEventListener("blur", hideTooltip);
      node.addEventListener("click", () => openModelDrawer(id));
    });
  }

  /* ========================================================================
     Track, Sorting & Filtering Logic
     ======================================================================== */

  function getActiveTrack() {
    return state.data.tracks[state.trackId];
  }

  function getFilteredAndSortedModels(ignoreParetoFilter = false) {
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

    if (!ignoreParetoFilter && supportsPareto(track) && state.paretoOnly) {
      const pareto = computeParetoFrontier(list, getActiveParetoModeKey(track));
      list = list.filter((m) => pareto.frontierSet.has(m.id));
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

  function computeAbsoluteBarPercent(val, col, globalStats) {
    if (val == null || Number.isNaN(val)) return 0;
    const num = Number(val);
    const fmt = col?.format || "index";

    // Bounded 0-100 absolute scales (AA Intelligence Index, FrontierCode %, HLE %, Omniscience, Agent)
    if (fmt === "pct" || fmt === "index") {
      return Math.max(0, Math.min(100, num));
    }

    // Elo scale (e.g. LMArena / AA-Briefcase): anchored to fixed absolute ceiling (0 .. >=2000)
    if (fmt === "elo") {
      const ceil = Math.max(2000, Math.ceil((globalStats?.max || 1800) / 200) * 200);
      return Math.max(0, Math.min(100, (num / ceil) * 100));
    }

    // Output speed (tokens/s): proportional from 0 to rounded global ceiling
    if (fmt === "speed") {
      const ceil = Math.max(100, Math.ceil((globalStats?.max || 500) / 100) * 100);
      return Math.max(0, Math.min(100, (num / ceil) * 100));
    }

    // Lower-is-better unbounded metrics (price, latency, costPerTask): inverse against fixed track global max
    if (col?.lowerIsBetter) {
      const hi = Math.max(0.01, globalStats?.max || num || 1);
      return Math.max(4, Math.min(100, (1 - num / hi) * 100));
    }

    const hi = Math.max(1, globalStats?.max || 100);
    return Math.max(0, Math.min(100, (num / hi) * 100));
  }

  /* ========================================================================
     Rendering
     ======================================================================== */

  function updateSearchPlaceholder(track) {
    if (!el.searchInput || !track?.models?.length) return;
    const seen = [];
    for (const m of track.models) {
      const name = m.releaseName || m.name;
      if (name && !seen.includes(name)) seen.push(name);
      if (seen.length === 3) break;
    }
    el.searchInput.placeholder = seen.length
      ? `搜索模型或厂商 (如 ${seen.join(", ")})...`
      : "搜索模型名称或厂商...";
  }

  function renderAll() {
    const track = getActiveTrack();
    const canPareto = supportsPareto(track);
    el.dedupReleaseWrap.style.display = track.supportsReleaseDedup ? "inline-flex" : "none";
    el.paretoOnlyWrap.style.display = canPareto ? "inline-flex" : "none";
    updateSearchPlaceholder(track);
    renderTrackTabs();
    renderTrackDesc();
    renderVendorControls();
    renderTable(); // renderTable also calls reactive renderSummaryStrip(list, pareto)
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

  function renderSummaryStrip(filteredList, pareto) {
    const track = getActiveTrack();
    const viewList = Array.isArray(filteredList) ? filteredList : track.models;
    const activeCol = track.columns.find((c) => c.key === state.sortKey) || track.columns[0];
    const isFiltered =
      state.license !== "all" ||
      state.vendor !== "all" ||
      state.search.trim().length > 0 ||
      state.flagshipOnly ||
      (supportsPareto(track) && state.paretoOnly);

    const topModel = viewList[0];
    const topScore = topModel ? (state.sortKey === "votes" ? topModel.votes : topModel.scores?.[activeCol.key]) : null;
    const topOpen = viewList.find((m) => m.isOpen);
    const topOpenScore = topOpen ? (state.sortKey === "votes" ? topOpen.votes : topOpen.scores?.[activeCol.key]) : null;
    const vendorSet = new Set(viewList.map((m) => m.vendor));
    const openCount = viewList.filter((m) => m.isOpen).length;
    const sourceMeta = state.data.meta.sources.find((s) => s.id === track.source);

    const topHtml = topModel
      ? `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topModel.vendor, "sm")}
          <span class="summary-main" title="${esc(topModel.name)}">${esc(topModel.name)}</span>
          <span class="summary-score">${state.sortKey === "votes" ? formatNumber(topScore) : formatColValue(topScore, activeCol)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topModel.vendor).name)} · ${topModel.isOpen ? "开源权重" : "闭源商业"}</div>
      `
      : `<div class="summary-main">暂无匹配模型</div><div class="summary-meta">请调整上方筛选条件</div>`;

    // Card 2 adapts intelligently when filtering closed-only or Pareto track
    let card2Label = isFiltered ? "当前视图开源 #1" : "开源权重 #1 最佳";
    let card2Tag = "Open Weights";
    let card2Html = "";

    if (state.license === "closed" && pareto && pareto.frontier.length > 0) {
      card2Label = "当前视图帕累托前沿";
      card2Tag = pareto.cfg.shortLabel;
      const cheapestTop = pareto.frontier[Math.min(pareto.frontier.length - 1, Math.floor(pareto.frontier.length / 2))];
      card2Html = `
        <div class="summary-value-row">
          ${renderVendorIconHtml(cheapestTop.model.vendor, "sm")}
          <span class="summary-main" title="${esc(cheapestTop.model.name)}">${esc(cheapestTop.model.name)}</span>
          <span class="summary-score">${pareto.frontier.length} 款</span>
        </div>
        <div class="summary-meta">前沿代表 · 智力 ${formatColValue(cheapestTop.y, { format: "index" })} / ${formatColValue(cheapestTop.x, { format: pareto.cfg.format })}</div>
      `;
    } else if (topOpen) {
      const openDisplayRank = viewList.indexOf(topOpen) + 1;
      card2Html = `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topOpen.vendor, "sm")}
          <span class="summary-main" title="${esc(topOpen.name)}">${esc(topOpen.name)}</span>
          <span class="summary-score">${state.sortKey === "votes" ? formatNumber(topOpenScore) : formatColValue(topOpenScore, activeCol)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topOpen.vendor).name)} · 当前第 #${openDisplayRank} (${esc(topOpen.license)})</div>
      `;
    } else {
      card2Html = `
        <div class="summary-value-row"><span class="summary-main">暂无开源上榜</span></div>
        <div class="summary-meta">${state.license === "closed" ? "当前已筛选为仅看闭源模型" : "当前筛选下无开源模型"}</div>
      `;
    }

    const coverageMain = track.supportsReleaseDedup && !isFiltered && state.dedupRelease
      ? `${viewList.length} 系列 / ${track.models.length} 档位`
      : `${viewList.length} 款模型`;

    el.summaryStrip.innerHTML = `
      <div class="summary-cell">
        <div class="summary-label">
          <span>${isFiltered ? "当前筛选 #1 领跑" : "当前赛道 #1 领跑"}</span>
          <span class="mono">${esc(state.sortKey === "votes" ? "盲测票数" : activeCol.label)}</span>
        </div>
        ${topHtml}
      </div>

      <div class="summary-cell">
        <div class="summary-label">
          <span>${esc(card2Label)}</span>
          <span class="mono">${esc(card2Tag)}</span>
        </div>
        ${card2Html}
      </div>

      <div class="summary-cell">
        <div class="summary-label"><span>${isFiltered ? "当前筛选覆盖" : "评测覆盖"}</span></div>
        <div class="summary-value-row">
          <span class="summary-main mono">${esc(coverageMain)}</span>
          <span class="summary-score" style="color:var(--text-secondary)">${vendorSet.size} 厂商</span>
        </div>
        <div class="summary-meta">开源 ${openCount} 款 · 闭源 ${viewList.length - openCount} 款</div>
      </div>

      <div class="summary-cell">
        <div class="summary-label">
          <span>权威数据源</span>
          <span class="mono">${esc(track.publishDate || "实时")}</span>
        </div>
        <div class="summary-value-row">
          <span class="summary-main">${esc(sourceMeta?.name || track.source)}</span>
        </div>
        <div class="summary-meta">同步于 ${esc(formatDateTimeLocal(state.data.meta.generatedAt))}</div>
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
    const eligibleModels = track.models.filter((m) => {
      if (state.license === "open" && !m.isOpen) return false;
      if (state.license === "closed" && m.isOpen) return false;
      return true;
    });

    const counts = new Map();
    const seenPerVendor = new Map();
    const bestRankPerVendor = new Map();
    for (const m of eligibleModels) {
      const k = track.supportsReleaseDedup && state.dedupRelease ? (m.releaseSlug || m.name) : m.id;
      if (!seenPerVendor.has(m.vendor)) seenPerVendor.set(m.vendor, new Set());
      seenPerVendor.get(m.vendor).add(k);
      if (!bestRankPerVendor.has(m.vendor) || m.rank < bestRankPerVendor.get(m.vendor)) {
        bestRankPerVendor.set(m.vendor, m.rank);
      }
    }
    for (const [vid, set] of seenPerVendor.entries()) {
      counts.set(vid, set.size);
    }

    const sortedVendors = [...counts.entries()].sort((a, b) => {
      const bestA = bestRankPerVendor.get(a[0]) ?? 9999;
      const bestB = bestRankPerVendor.get(b[0]) ?? 9999;
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

    // Render EVERY vendor present in the current fetched leaderboard dynamically (no hardcoded limit)
    el.vendorRibbon.classList.toggle("is-expanded", state.vendorRibbonExpanded);
    const toggleBtn =
      sortedVendors.length > 10
        ? `<button class="vendor-chip vendor-chip-toggle" data-toggle-vendors="1" type="button" title="${state.vendorRibbonExpanded ? "收起为单行横向滚动" : "换行展开查看当前榜单全部厂商"}">
             ${state.vendorRibbonExpanded ? "收起" : `展开全部 (${sortedVendors.length})`}
           </button>`
        : "";

    el.vendorRibbon.innerHTML =
      `<button class="vendor-chip ${state.vendor === "all" ? "active" : ""}" data-vendor="all" type="button">全部厂商 <span class="mono" style="opacity:.6;font-size:.74rem">${sortedVendors.length}</span></button>` +
      toggleBtn +
      sortedVendors
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

  function getGlobalTierBaseline(track) {
    if (!track.supportsReleaseDedup || !state.dedupRelease) return track.models;
    const seen = new Set();
    return track.models.filter((m) => {
      const rk = m.releaseSlug || m.name;
      if (seen.has(rk)) return false;
      seen.add(rk);
      return true;
    });
  }

  function renderTable() {
    const track = getActiveTrack();
    const baseList = getFilteredAndSortedModels(true);
    const pareto = supportsPareto(track)
      ? computeParetoFrontier(baseList, getActiveParetoModeKey(track))
      : null;

    if (track.isParetoTrack && pareto) {
      renderParetoPanel(pareto);
    } else {
      el.paretoSection.style.display = "none";
    }

    const list =
      state.paretoOnly && pareto
        ? baseList.filter((m) => pareto.frontierSet.has(m.id))
        : baseList;

    // Keep displayRank map synced so detail drawer shows the exact rank from the table
    state.displayRankMap = new Map(list.map((m, idx) => [m.id, idx + 1]));

    // Update top 4 KPI cards reactively to match current filter & sort
    renderSummaryStrip(list, pareto);

    // Compute tier highlight thresholds against the FULL track (never inflated when filtering to 1 vendor)
    const globalStats = computeColumnStats(track, getGlobalTierBaseline(track));
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
    const pGlobal = globalStats[primaryCol.key];

    el.tableBody.innerHTML = slice
      .map((m, i) => {
        const displayRank = i + 1;
        const rankCls =
          displayRank === 1 ? "rank-1" : displayRank === 2 ? "rank-2" : displayRank === 3 ? "rank-3" : "";
        const v = getVendor(m.vendor);
        const isCompared = state.compareIds.includes(m.id);
        const isParetoOpt = Boolean(pareto && pareto.frontierSet.has(m.id));

        const pVal = m.scores?.[primaryCol.key];
        const pct = computeAbsoluteBarPercent(pVal, primaryCol, pGlobal);

        const subCells = cols
          .slice(1)
          .map((col) => {
            const val = m.scores?.[col.key];
            const isSortedCol = state.sortKey === col.key;
            if (val == null) {
              return `<td class="td-score ${isSortedCol ? "sorted-col" : ""}"><span class="dim-pill tier-empty">—</span></td>`;
            }
            const cStat = globalStats[col.key];
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
                    ${isParetoOpt ? `<span class="pareto-badge" title="当前筛选条件下位于帕累托最优前沿">帕累托最优</span>` : ""}
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
    const viewRank = state.displayRankMap?.get(model.id);
    const shownRank = viewRank != null ? viewRank : model.rank;
    const rankSub =
      viewRank != null && viewRank !== model.rank
        ? `<span style="font-size:.73rem;color:var(--text-muted);font-weight:500"> (全档位 #${model.rank})</span>`
        : "";

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
          <div class="drawer-kpi-val">#${shownRank}${rankSub}</div>
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

    // Dimension breakdown bars (absolute scale)
    const barsHtml = track.columns
      .map((col) => {
        const val = model.scores?.[col.key];
        const pct = computeAbsoluteBarPercent(val, col, stats[col.key]);
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
            ? `<div class="radar-wrap" id="radar-wrap">
                 <canvas id="radar-canvas"></canvas>
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
                <td>当前排名</td>
                ${models.map((m) => `<td class="mono">#${state.displayRankMap?.get(m.id) ?? m.rank}</td>`).join("")}
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
      state.activeRadarArgs = [effectiveRadarCols, models, stats];
      drawRadarChart(document.getElementById("radar-canvas"), effectiveRadarCols, models, stats);
    } else {
      state.activeRadarArgs = null;
    }
  }

  function drawRadarChart(canvas, cols, models, stats) {
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const availW = wrap ? wrap.getBoundingClientRect().width : 320;
    const size = Math.round(Math.max(240, Math.min(340, availW || 320)));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.14)" : "rgba(20,21,23,0.11)";
    const labelColor = isDark ? "#a1a7b5" : "#4b5563";
    const ringTextColor = isDark ? "rgba(161,167,181,0.55)" : "rgba(88,93,104,0.55)";

    const cx = size / 2;
    const cy = size / 2;
    const r = Math.round(size * 0.31);
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

      // Subtle absolute scale tick labels (25 / 50 / 75 / 100) along top axis
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = ringTextColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ring * 25), cx + 4, cy - rr + 1);
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

    // Plot using true absolute scale (computeAbsoluteBarPercent / 100) matching table & drawer
    models.forEach((m, mi) => {
      const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const col = cols[i];
        const val = m.scores?.[col.key];
        const norm = val != null ? Math.max(0.05, computeAbsoluteBarPercent(val, col, stats[col.key]) / 100) : 0.04;
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
    if (el.themeSwitcher) {
      el.themeSwitcher.addEventListener("click", (e) => {
        const btn = e.target.closest(".theme-btn[data-theme-mode]");
        if (!btn) return;
        const mode = btn.getAttribute("data-theme-mode");
        applyThemeMode(mode, true);
      });
    }

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
        renderVendorControls();
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
      const toggle = e.target.closest("[data-toggle-vendors]");
      if (toggle) {
        state.vendorRibbonExpanded = !state.vendorRibbonExpanded;
        renderVendorControls();
        return;
      }
      const chip = e.target.closest("[data-vendor]");
      if (!chip) return;
      state.vendor = chip.getAttribute("data-vendor");
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    el.paretoOnly.addEventListener("change", () => {
      state.paretoOnly = el.paretoOnly.checked;
      el.paretoOnlyWrap.classList.toggle("active", state.paretoOnly);
      state.visibleCount = PAGE_STEP;
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

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (!state.data) return;
      const needPareto = getActiveTrack().isParetoTrack;
      const needRadar = el.compareModal.classList.contains("open") && state.activeRadarArgs;
      if (!needPareto && !needRadar) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (needPareto) renderTable();
        if (needRadar) {
          const canvas = document.getElementById("radar-canvas");
          if (canvas) drawRadarChart(canvas, ...state.activeRadarArgs);
        }
      }, 120);
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

    const closeCompareModal = () => {
      el.compareModal.classList.remove("open");
      state.activeRadarArgs = null;
    };
    el.compareModalClose.addEventListener("click", closeCompareModal);
    el.compareModal.addEventListener("click", (e) => {
      if (e.target === el.compareModal) closeCompareModal();
    });

    el.sourcesModalClose.addEventListener("click", () => el.sourcesModal.classList.remove("open"));
    el.sourcesModal.addEventListener("click", (e) => {
      if (e.target === el.sourcesModal) el.sourcesModal.classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDrawer();
        closeCompareModal();
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
