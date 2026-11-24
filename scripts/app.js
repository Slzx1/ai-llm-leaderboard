(() => {
  "use strict";

  const DATA_URL = "data/leaderboard.json";
  const REPO_URL = "https://github.com/Slzx1/ai-llm-leaderboard";
  const COMPARE_COLORS = ["#1a56db", "#0d9488", "#d97706", "#e11d48"];
  const PAGE_STEP = 50;

  const state = {
    data: null,
    trackId: "text",
    sortKey: "overall",
    sortDir: "desc",
    search: "",
    license: "all", // all | open | closed
    vendor: "all",
    flagshipOnly: false,
    visibleCount: PAGE_STEP,
    compareIds: [], // model IDs within active track
    activeDrawerModel: null,
    countdownTimer: null,
    autoPollTimer: null,
  };

  // DOM references
  const el = {
    trackTabs: document.getElementById("track-tabs"),
    summaryStrip: document.getElementById("summary-strip"),
    trackDescBar: document.getElementById("track-desc-bar"),
    searchInput: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    vendorSelect: document.getElementById("vendor-select"),
    vendorRibbon: document.getElementById("vendor-ribbon"),
    flagshipOnly: document.getElementById("flagship-only"),
    flagshipWrap: document.getElementById("flagship-toggle-wrap"),
    tableHead: document.getElementById("table-head"),
    tableBody: document.getElementById("table-body"),
    tableFooter: document.getElementById("table-footer"),
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
     Utilities
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

  function formatScore(val, track) {
    if (val == null || Number.isNaN(val)) return "—";
    if (track && (track.source === "livebench" || track.id === "agent")) {
      return Number(val).toFixed(1);
    }
    return Math.round(Number(val)).toString();
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

  function getNextCronUtc(intervalHours = 6) {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      Math.floor(now.getUTCHours() / intervalHours) * intervalHours + intervalHours,
      0,
      0,
      0
    ));
    return next;
  }

  function formatCountdown(targetDate) {
    const diffMs = Math.max(0, targetDate.getTime() - Date.now());
    const totalMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hrs}小时${String(mins).padStart(2, "0")}分`;
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
        <span class="${cls}" title="${esc(v.name)} (${esc(v.nameZh)})">
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
     Data Loading & Live Refresh
     ======================================================================== */

  async function loadData(bustCache = false) {
    const url = bustCache ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
    const resp = await fetch(url, { cache: bustCache ? "no-store" : "default" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    state.data = json;

    // Validate track from URL hash
    const hashTrack = location.hash.replace(/^#/, "");
    const order = json.meta.trackOrder || Object.keys(json.tracks);
    if (hashTrack && json.tracks[hashTrack]) {
      state.trackId = hashTrack;
    } else if (!json.tracks[state.trackId]) {
      state.trackId = order[0];
    }

    const activeTrack = getActiveTrack();
    if (!activeTrack.columns.some((c) => c.key === state.sortKey)) {
      state.sortKey = activeTrack.columns[0].key;
      state.sortDir = "desc";
    }

    renderAll();
    updateSyncStatus();
  }

  async function manualRefresh() {
    el.btnRefresh.classList.add("is-loading");
    el.btnRefresh.disabled = true;
    try {
      const prevGenerated = state.data?.meta?.generatedAt;
      await loadData(true);

      // Also check live HuggingFace LMArena publish date directly in browser
      let liveNote = "";
      try {
        const hfResp = await fetch(
          "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=text&split=latest&offset=0&length=1",
          { cache: "no-store" }
        );
        if (hfResp.ok) {
          const hfJson = await hfResp.json();
          const latestDate = hfJson?.rows?.[0]?.row?.leaderboard_publish_date;
          const localDate = state.data?.tracks?.text?.publishDate;
          if (latestDate && localDate) {
            liveNote =
              latestDate === localDate
                ? ` · 已与 LMArena 官方 (${latestDate}) 保持最新同步`
                : ` · 检测到 LMArena 新发布 (${latestDate})，下次定时任务将自动同步`;
          }
        }
      } catch {
        // Ignore CORS/network errors on live check
      }

      const changed = prevGenerated && prevGenerated !== state.data?.meta?.generatedAt;
      showToast(changed ? `已拉取最新排行快照${liveNote}` : `排行已是最新${liveNote}`);
    } catch (err) {
      showToast(`刷新失败：${err.message}`);
    } finally {
      el.btnRefresh.classList.remove("is-loading");
      el.btnRefresh.disabled = false;
    }
  }

  function updateSyncStatus() {
    if (!state.data) return;
    const track = getActiveTrack();
    const interval = state.data.meta.scheduleIntervalHours || 6;
    const nextRun = getNextCronUtc(interval);
    const pub = track?.publishDate || "";
    el.syncStatusLabel.textContent = `榜单日期 ${pub} · 下次自动更新 ${formatCountdown(nextRun)}`;
  }

  /* ========================================================================
     Track & Filtering Logic
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
        const hay = `${m.name} ${m.vendor} ${v.name} ${v.nameZh} ${m.license}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort
    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let va, vb;
      if (key === "votes") {
        va = a.votes;
        vb = b.votes;
      } else if (key === "contextLength") {
        va = a.contextLength;
        vb = b.contextLength;
      } else {
        va = a.scores?.[key];
        vb = b.scores?.[key];
      }
      const aMissing = va == null || Number.isNaN(va);
      const bMissing = vb == null || Number.isNaN(vb);
      if (aMissing && bMissing) return a.rank - b.rank;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (va === vb) return a.rank - b.rank;
      return (va - vb) * dir;
    });

    // Flagship deduplication per vendor (keep highest ranked under current sort)
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

  function computeColumnStats(track) {
    const stats = {};
    for (const col of track.columns) {
      const vals = track.models
        .map((m) => m.scores?.[col.key])
        .filter((v) => v != null && !Number.isNaN(v))
        .sort((a, b) => b - a);
      stats[col.key] = {
        max: vals[0] ?? 100,
        min: vals[vals.length - 1] ?? 0,
        top5: vals[Math.min(4, Math.max(0, vals.length - 1))] ?? 0,
        top15: vals[Math.min(14, Math.max(0, vals.length - 1))] ?? 0,
      };
    }
    return stats;
  }

  /* ========================================================================
     Rendering
     ======================================================================== */

  function renderAll() {
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
        return `
          <button
            class="track-tab ${active}"
            role="tab"
            aria-selected="${id === state.trackId}"
            data-track="${esc(id)}"
            type="button"
          >
            <span>${esc(t.shortName)}</span>
            <span class="track-tab-count">${t.models.length}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderSummaryStrip() {
    const track = getActiveTrack();
    const topModel = track.models[0];
    const topOpen = track.models.find((m) => m.isOpen);
    const vendorSet = new Set(track.models.map((m) => m.vendor));
    const openCount = track.models.filter((m) => m.isOpen).length;
    const primaryCol = track.columns[0];
    const sourceMeta = state.data.meta.sources.find((s) => s.id === track.source);

    const topHtml = topModel
      ? `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topModel.vendor, "sm")}
          <span class="summary-main" title="${esc(topModel.name)}">${esc(topModel.name)}</span>
          <span class="summary-score">${formatScore(topModel.score, track)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topModel.vendor).name)} · ${topModel.isOpen ? esc(topModel.license) : "闭源旗舰"}</div>
      `
      : `<div class="summary-main">—</div>`;

    const openHtml = topOpen
      ? `
        <div class="summary-value-row">
          ${renderVendorIconHtml(topOpen.vendor, "sm")}
          <span class="summary-main" title="${esc(topOpen.name)}">${esc(topOpen.name)}</span>
          <span class="summary-score">${formatScore(topOpen.score, track)}</span>
        </div>
        <div class="summary-meta">${esc(getVendor(topOpen.vendor).name)} · 总榜 #${topOpen.rank} (${esc(topOpen.license)})</div>
      `
      : `
        <div class="summary-value-row"><span class="summary-main">暂无开源上榜</span></div>
        <div class="summary-meta">该赛道目前均为闭源 API 模型</div>
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
        <div class="summary-label"><span>收录规模</span></div>
        <div class="summary-value-row">
          <span class="summary-main mono">${track.models.length} 款模型</span>
          <span class="summary-score" style="color:var(--text-secondary)">${vendorSet.size} 家厂商</span>
        </div>
        <div class="summary-meta">开源 ${openCount} 款 · 闭源 ${track.models.length - openCount} 款</div>
      </div>

      <div class="summary-cell">
        <div class="summary-label">
          <span>权威数据源</span>
          <span class="mono">${esc(track.publishDate || "最新")}</span>
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
          ? `<a class="track-source-link" href="${esc(src.datasetUrl)}" target="_blank" rel="noopener">
               验证原始官方数据 (${esc(src.name)}) ↗
             </a>`
          : ""
      }
    `;
  }

  function renderVendorControls() {
    const track = getActiveTrack();
    const counts = new Map();
    for (const m of track.models) {
      counts.set(m.vendor, (counts.get(m.vendor) || 0) + 1);
    }
    const sortedVendors = [...counts.entries()].sort((a, b) => {
      // Order by best rank in track first, then count
      const bestA = track.models.find((m) => m.vendor === a[0])?.rank ?? 999;
      const bestB = track.models.find((m) => m.vendor === b[0])?.rank ?? 999;
      return bestA - bestB;
    });

    if (state.vendor !== "all" && !counts.has(state.vendor)) {
      state.vendor = "all";
    }

    // Select dropdown
    el.vendorSelect.innerHTML =
      `<option value="all">全部厂商 (${sortedVendors.length})</option>` +
      sortedVendors
        .map(([vid, cnt]) => {
          const v = getVendor(vid);
          const label = v.nameZh && v.nameZh !== v.name ? `${v.name} · ${v.nameZh}` : v.name;
          return `<option value="${esc(vid)}" ${state.vendor === vid ? "selected" : ""}>${esc(label)} (${cnt})</option>`;
        })
        .join("");

    // Top 14 vendors quick chip ribbon with official icons
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
    const stats = computeColumnStats(track);
    const hasVotes = track.models.some((m) => m.votes != null);
    const cols = track.columns;

    // Header
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
      if (idx === 0) {
        headCells.push(`
          <th class="col-primary-score sortable ${sortedCls}" data-sort="${esc(col.key)}">
            <span class="th-inner">${esc(col.label)} ${arrow(col.key)}</span>
          </th>
        `);
      } else {
        headCells.push(`
          <th class="th-right sortable ${sortedCls}" data-sort="${esc(col.key)}">
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

    // Body
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
    const pMin = stats[primaryCol.key].min;
    const pMax = stats[primaryCol.key].max;
    const pSpan = Math.max(1, pMax - pMin);

    el.tableBody.innerHTML = slice
      .map((m, i) => {
        const displayRank = i + 1;
        const rankCls =
          displayRank === 1 ? "rank-1" : displayRank === 2 ? "rank-2" : displayRank === 3 ? "rank-3" : "";
        const v = getVendor(m.vendor);
        const isCompared = state.compareIds.includes(m.id);

        const pVal = m.scores?.[primaryCol.key];
        const pct = pVal != null ? Math.max(6, Math.min(100, ((pVal - pMin) / pSpan) * 100)) : 0;

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
            if (val >= cStat.top5) tier = "tier-top";
            else if (val >= cStat.top15) tier = "tier-high";
            return `
              <td class="td-score ${isSortedCol ? "sorted-col" : ""}">
                <span class="dim-pill ${tier}">${formatScore(val, track)}</span>
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
                  <span class="score-main">${formatScore(pVal, track)}</span>
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

    // Footer
    const remaining = list.length - slice.length;
    el.tableFooter.innerHTML = `
      <span>当前显示 <strong>${slice.length}</strong> / ${list.length} 款模型（点击任意行查看多维能力档案与跨赛道表现）</span>
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
     Model Detail Drawer (with Cross-Track Lookup)
     ======================================================================== */

  function openModelDrawer(modelId) {
    const track = getActiveTrack();
    const model = track.models.find((m) => m.id === modelId);
    if (!model) return;
    state.activeDrawerModel = model;

    const v = getVendor(model.vendor);
    const stats = computeColumnStats(track);

    el.drawerTitleGroup.innerHTML = `
      ${renderVendorIconHtml(model.vendor, "lg")}
      <div>
        <h2 class="drawer-title">${esc(model.name)}</h2>
        <div class="drawer-subtitle">
          <span>${esc(v.name)}${v.nameZh && v.nameZh !== v.name ? ` · ${esc(v.nameZh)}` : ""}</span>
          <span class="lic-tag ${model.isOpen ? "open" : "prop"}">${esc(model.license)}</span>
        </div>
      </div>
    `;

    // KPI tiles
    const priceStr =
      model.pricing && (model.pricing.input > 0 || model.pricing.output > 0)
        ? `$${model.pricing.input} / $${model.pricing.output}`
        : "—";

    const kpiHtml = `
      <div class="drawer-kpi-grid">
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${esc(track.shortName)} 排名</div>
          <div class="drawer-kpi-val">#${model.rank}</div>
        </div>
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${esc(track.scoreLabel)}</div>
          <div class="drawer-kpi-val">${formatScore(model.score, track)}${model.ci != null ? `<span style="font-size:.75rem;color:var(--text-muted);font-weight:500"> ±${model.ci}</span>` : ""}</div>
        </div>
        <div class="drawer-kpi">
          <div class="drawer-kpi-label">${model.votes != null ? "盲测票数" : "上下文窗口"}</div>
          <div class="drawer-kpi-val">${model.votes != null ? formatNumber(model.votes) : formatContext(model.contextLength)}</div>
        </div>
      </div>
      ${
        model.contextLength || model.pricing
          ? `<div class="drawer-kpi-grid" style="grid-template-columns:1fr 1fr;margin-top:-10px;">
               <div class="drawer-kpi">
                 <div class="drawer-kpi-label">上下文窗口 (OpenRouter)</div>
                 <div class="drawer-kpi-val">${formatContext(model.contextLength)}</div>
               </div>
               <div class="drawer-kpi">
                 <div class="drawer-kpi-label">参考 API 价 (输入/输出 /1M)</div>
                 <div class="drawer-kpi-val" style="font-size:.9rem">${esc(priceStr)}</div>
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
        const span = Math.max(1, st.max - st.min);
        const pct = val != null ? Math.max(5, Math.min(100, ((val - st.min) / span) * 100)) : 0;
        return `
          <div class="dim-bar-row">
            <div class="dim-bar-head">
              <span>${esc(col.label)}</span>
              <span class="mono">${val != null ? formatScore(val, track) : "暂无评测"}</span>
            </div>
            <div class="dim-bar-track">
              <div class="dim-bar-fill" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
        `;
      })
      .join("");

    // Cross-track appearances
    const normTarget = model.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const crossMatches = [];
    for (const [tid, t] of Object.entries(state.data.tracks)) {
      if (tid === track.id) continue;
      const found = t.models.find(
        (x) => x.name.toLowerCase() === model.name.toLowerCase() || x.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === normTarget
      );
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
                    <span class="mono"><strong>#${cm.rank}</strong> · ${formatScore(cm.score, ct)} ${esc(ct.scoreUnit)}</span>
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
        <h3 class="drawer-section-title">当前赛道各维度得分分布</h3>
        <div class="dim-bar-list">${barsHtml}</div>
      </div>
      ${crossHtml}
    `;

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
    el.btnOpenCompare.textContent = models.length < 2 ? `再选 1 款即可对比` : `对比这 ${models.length} 款模型`;
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
    const canRadar = cols.length >= 3;

    const tableRows = cols
      .map((col) => {
        const vals = models.map((m) => m.scores?.[col.key]);
        const numericVals = vals.filter((v) => v != null && !Number.isNaN(v));
        const bestVal = numericVals.length ? Math.max(...numericVals) : null;
        return `
          <tr>
            <td>${esc(col.label)}</td>
            ${vals
              .map((v) => {
                const isBest = v != null && bestVal != null && v === bestVal;
                return `<td class="mono ${isBest ? "compare-best" : ""}">${v != null ? formatScore(v, track) : "—"}</td>`;
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
                 <canvas id="radar-canvas" width="310" height="310" style="width:310px;height:310px"></canvas>
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
      drawRadarChart(document.getElementById("radar-canvas"), cols, models, stats);
    }
  }

  function drawRadarChart(canvas, cols, models, stats) {
    const dpr = window.devicePixelRatio || 1;
    const size = 310;
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

    // Concentric polygons
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

    // Axes & labels
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

      const lx = cx + Math.cos(ang) * (r + 22);
      const ly = cy + Math.sin(ang) * (r + 18);
      ctx.fillText(cols[i].label, lx, ly);
    }

    // Normalize relative to selected models' band + track floor for visual discrimination
    models.forEach((m, mi) => {
      const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const col = cols[i];
        const val = m.scores?.[col.key];
        const st = stats[col.key];
        const floor = st.min + (st.max - st.min) * 0.35;
        const span = Math.max(1, st.max - floor);
        const norm = val != null ? Math.max(0.12, Math.min(1, (val - floor) / span)) : 0.1;
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
    const nextRun = getNextCronUtc(meta.scheduleIntervalHours || 6);

    el.sourcesModalBody.innerHTML = `
      <div class="source-list">
        <div class="source-card">
          <div class="source-card-head">
            <span class="source-card-title">定时自动抓取机制（GitHub Actions Cron）</span>
            <span class="mono" style="font-size:.8rem;color:var(--accent)">${esc(meta.scheduleCron)}</span>
          </div>
          <p>
            本站点通过 GitHub Actions 定时任务每 <strong>${meta.scheduleIntervalHours || 6} 小时</strong> 自动执行一次抓取脚本，直接拉取官方公开 Parquet/CSV/API 数据，生成静态快照并自动重新部署，无需人工维护。页面打开时也会每 30 分钟自动静默检查更新。
          </p>
          <div class="source-card-links">
            <span>上次同步：<strong>${esc(formatDateTimeLocal(meta.generatedAt))}</strong></span>
            <span>下次定时运行约 <strong>${esc(formatCountdown(nextRun))}</strong> 后</span>
            <a href="${REPO_URL}/actions" target="_blank" rel="noopener">查看自动抓取运行日志 ↗</a>
          </div>
        </div>

        ${meta.sources
          .map(
            (s) => `
            <div class="source-card">
              <div class="source-card-head">
                <span class="source-card-title">${esc(s.name)}</span>
                <span class="mono" style="font-size:.78rem;color:var(--text-muted)">官方公开源</span>
              </div>
              <p>${esc(s.description)}</p>
              <div class="source-card-links">
                <a href="${esc(s.url)}" target="_blank" rel="noopener">官方网站 ↗</a>
                <a href="${esc(s.datasetUrl)}" target="_blank" rel="noopener">原始公开数据集 / API ↗</a>
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
            所有厂商图标均直接拉取自开源官方图标库 <code>@lobehub/icons-static-svg</code>、<code>Simple Icons</code> 及对应厂商官方网站图标资产，确保原汁原味且高速加载。
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
    state.sortKey = state.data.tracks[trackId].columns[0].key;
    state.sortDir = "desc";
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

    el.btnRefresh.addEventListener("click", manualRefresh);
    el.btnSources.addEventListener("click", openSourcesModal);

    // Track tabs delegation
    el.trackTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-track]");
      if (!btn) return;
      switchTrack(btn.getAttribute("data-track"));
    });

    // Search
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

    // License segmented filter
    document.querySelectorAll(".seg-btn[data-license]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".seg-btn[data-license]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.license = btn.getAttribute("data-license");
        state.visibleCount = PAGE_STEP;
        renderTable();
      });
    });

    // Vendor select
    el.vendorSelect.addEventListener("change", () => {
      state.vendor = el.vendorSelect.value;
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    // Vendor quick chips
    el.vendorRibbon.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-vendor]");
      if (!chip) return;
      state.vendor = chip.getAttribute("data-vendor");
      state.visibleCount = PAGE_STEP;
      renderVendorControls();
      renderTable();
    });

    // Flagship only toggle
    el.flagshipOnly.addEventListener("change", () => {
      state.flagshipOnly = el.flagshipOnly.checked;
      el.flagshipWrap.classList.toggle("active", state.flagshipOnly);
      state.visibleCount = PAGE_STEP;
      renderTable();
    });

    // Table header sort
    el.tableHead.addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      renderTable();
    });

    // Table row click (drawer) & compare checkbox
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

    // Drawer close
    el.drawerClose.addEventListener("click", closeDrawer);
    el.drawerBackdrop.addEventListener("click", closeDrawer);

    // Compare dock
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

    // Modals close
    el.compareModalClose.addEventListener("click", () => el.compareModal.classList.remove("open"));
    el.compareModal.addEventListener("click", (e) => {
      if (e.target === el.compareModal) el.compareModal.classList.remove("open");
    });

    el.sourcesModalClose.addEventListener("click", () => el.sourcesModal.classList.remove("open"));
    el.sourcesModal.addEventListener("click", (e) => {
      if (e.target === el.sourcesModal) el.sourcesModal.classList.remove("open");
    });

    // ESC key closes drawers/modals
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
  }

  async function boot() {
    initTheme();
    bindEvents();
    try {
      await loadData(false);
    } catch (err) {
      el.tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-state">
            加载排行榜数据失败（${esc(err.message)}），请点击右上角“刷新排行”重试。
          </td>
        </tr>
      `;
    }

    // Update countdown label every minute
    state.countdownTimer = setInterval(updateSyncStatus, 60_000);
    // Silently poll fresh JSON every 30 minutes while page stays open
    state.autoPollTimer = setInterval(() => {
      loadData(true).catch(() => {});
    }, 30 * 60_000);
  }

  boot();
})();
