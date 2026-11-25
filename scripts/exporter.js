(() => {
  "use strict";

  const FONT_SANS = '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  const COMPARE_COLORS = ["#1a56db", "#0d9488", "#d97706", "#e11d48"];

  function getPalette(isDark) {
    if (isDark) {
      return {
        isDark: true,
        bgCanvas: "#0f1115",
        bgSurface: "#161920",
        bgSubtle: "#1e222b",
        border: "#262b36",
        borderStrong: "#373e4d",
        textPrimary: "#eceef2",
        textSecondary: "#a1a7b5",
        textMuted: "#707786",
        accent: "#60a5fa",
        accentSoft: "rgba(96, 165, 250, 0.14)",
        accentSoftStrong: "rgba(96, 165, 250, 0.24)",
        openFg: "#34d399",
        openBg: "rgba(16, 185, 129, 0.16)",
        propFg: "#9ca3af",
        propBg: "rgba(156, 163, 175, 0.14)",
        rank1Bg: "rgba(245, 158, 11, 0.2)",
        rank1Fg: "#fbbf24",
        rank2Bg: "rgba(156, 163, 175, 0.2)",
        rank2Fg: "#d1d5db",
        rank3Bg: "rgba(234, 88, 12, 0.2)",
        rank3Fg: "#fb923c",
        barTrack: "#242934",
        barFill: "#60a5fa",
        gridLine: "rgba(255, 255, 255, 0.1)",
        axisLine: "rgba(255, 255, 255, 0.24)",
        envelopeFill: "rgba(96, 165, 250, 0.11)",
        dotClosed: "rgba(148, 163, 184, 0.55)",
        dotClosedStroke: "rgba(148, 163, 184, 0.9)",
        dotOpen: "rgba(52, 211, 153, 0.6)",
        dotOpenStroke: "rgba(52, 211, 153, 0.95)",
        labelBg: "rgba(22, 25, 32, 0.94)",
        nodeBg: "#1e222b",
        shadow: "rgba(0, 0, 0, 0.45)",
      };
    }
    return {
      isDark: false,
      bgCanvas: "#f7f7f5",
      bgSurface: "#ffffff",
      bgSubtle: "#f1f0ec",
      border: "#e5e4df",
      borderStrong: "#d4d3cc",
      textPrimary: "#141517",
      textSecondary: "#585d68",
      textMuted: "#848a96",
      accent: "#1a56db",
      accentSoft: "rgba(26, 86, 219, 0.08)",
      accentSoftStrong: "rgba(26, 86, 219, 0.16)",
      openFg: "#0b6e4f",
      openBg: "#e7f6f0",
      propFg: "#4b5563",
      propBg: "#f1f2f4",
      rank1Bg: "#fef3c7",
      rank1Fg: "#92400e",
      rank2Bg: "#eceff3",
      rank2Fg: "#374151",
      rank3Bg: "#fbece2",
      rank3Fg: "#9a3412",
      barTrack: "#ecebe6",
      barFill: "#1a56db",
      gridLine: "rgba(20, 21, 23, 0.08)",
      axisLine: "rgba(20, 21, 23, 0.24)",
      envelopeFill: "rgba(26, 86, 219, 0.07)",
      dotClosed: "rgba(100, 116, 139, 0.42)",
      dotClosedStroke: "rgba(71, 85, 105, 0.72)",
      dotOpen: "rgba(11, 110, 79, 0.48)",
      dotOpenStroke: "rgba(11, 110, 79, 0.85)",
      labelBg: "rgba(255, 255, 255, 0.94)",
      nodeBg: "#ffffff",
      shadow: "rgba(20, 21, 23, 0.1)",
    };
  }

  /* ========================================================================
     Canvas Primitives & Sharp Official Icon Rasterizer
     ======================================================================== */

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
    roundRectPath(ctx, x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function truncateText(ctx, text, maxW) {
    const str = String(text ?? "");
    if (ctx.measureText(str).width <= maxW) return str;
    let lo = 0;
    let hi = str.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(str.slice(0, mid) + "…").width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return str.slice(0, Math.max(1, lo)) + "…";
  }

  function drawPill(ctx, x, y, text, opts = {}) {
    const {
      bg,
      fg,
      border = null,
      font = `600 11px ${FONT_SANS}`,
      padX = 7,
      height = 20,
      radius = 5,
    } = opts;
    ctx.save();
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const w = Math.ceil(tw + padX * 2);
    fillRoundRect(ctx, x, y, w, height, radius, bg, border, 1);
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, y + height / 2 + 0.5);
    ctx.restore();
    return w;
  }

  const iconCache = new Map();

  function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
  }

  function normalizeSvgForCanvas(svgText, tintColor) {
    let out = svgText.trim();
    // Ensure explicit pixel dimensions (96x96) instead of 1em so SVG rasterizes crisply at 2x Retina
    out = out.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
      let next = attrs
        .replace(/\bwidth\s*=\s*["'][^"']*["']/gi, "")
        .replace(/\bheight\s*=\s*["'][^"']*["']/gi, "");
      if (tintColor) {
        if (/\bcolor\s*=\s*["'][^"']*["']/i.test(next)) {
          next = next.replace(/\bcolor\s*=\s*["'][^"']*["']/i, `color="${tintColor}"`);
        } else {
          next += ` color="${tintColor}"`;
        }
      }
      return `<svg width="96" height="96"${next}>`;
    });
    return out;
  }

  async function loadVendorBitmap(vendor, isDark) {
    if (!vendor || !vendor.icon) return null;
    const shouldInvert = Boolean(isDark && vendor.mono);
    const cacheKey = `${vendor.icon}|${shouldInvert ? "darkMono" : "orig"}`;
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);

    try {
      let img = null;
      if (vendor.icon.toLowerCase().endsWith(".svg")) {
        const resp = await fetch(vendor.icon);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const svgText = await resp.text();
        const normalized = normalizeSvgForCanvas(svgText, "#141517");
        const blob = new Blob([normalized], { type: "image/svg+xml;charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        try {
          img = await loadImageFromUrl(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } else {
        img = await loadImageFromUrl(vendor.icon);
      }

      // Render into a 96x96 offscreen canvas with contain aspect ratio
      const off = document.createElement("canvas");
      off.width = 96;
      off.height = 96;
      const octx = off.getContext("2d");
      const iw = img.naturalWidth || img.width || 96;
      const ih = img.naturalHeight || img.height || 96;
      const ratio = Math.min(96 / iw, 96 / ih);
      const dw = iw * ratio;
      const dh = ih * ratio;
      octx.drawImage(img, (96 - dw) / 2, (96 - dh) / 2, dw, dh);

      if (shouldInvert) {
        // Exact RGB inversion matching CSS filter: invert(1) — preserves inner detail on both transparent and framed logos
        const imgData = octx.getImageData(0, 0, 96, 96);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0) {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
          }
        }
        octx.putImageData(imgData, 0, 0);
      }

      iconCache.set(cacheKey, off);
      return off;
    } catch {
      iconCache.set(cacheKey, null);
      return null;
    }
  }

  async function preloadVendors(vendorIds, getVendor, isDark) {
    const uniq = [...new Set(vendorIds.filter(Boolean))];
    await Promise.all(uniq.map((id) => loadVendorBitmap(getVendor(id), isDark)));
  }

  function drawVendorIcon(ctx, vendor, x, y, boxSize, isDark, pal, circle = false) {
    const shouldInvert = Boolean(isDark && vendor?.mono);
    const cacheKey = vendor?.icon ? `${vendor.icon}|${shouldInvert ? "darkMono" : "orig"}` : "";
    const bmp = cacheKey ? iconCache.get(cacheKey) : null;

    ctx.save();
    if (circle) {
      ctx.beginPath();
      ctx.arc(x + boxSize / 2, y + boxSize / 2, boxSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = pal.nodeBg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.accent;
      ctx.stroke();
    } else {
      fillRoundRect(ctx, x, y, boxSize, boxSize, 6, pal.bgSubtle, pal.border, 1);
    }

    if (bmp) {
      const pad = Math.round(boxSize * 0.18);
      ctx.drawImage(bmp, x + pad, y + pad, boxSize - pad * 2, boxSize - pad * 2);
    } else {
      ctx.font = `700 ${Math.round(boxSize * 0.36)}px ${FONT_SANS}`;
      ctx.fillStyle = pal.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((vendor?.name || "?").slice(0, 2).toUpperCase(), x + boxSize / 2, y + boxSize / 2 + 0.5);
    }
    ctx.restore();
  }

  /* ========================================================================
     Shared Header & Footer Frame
     ======================================================================== */

  function drawPosterHeader(ctx, width, padX, y, pal, info) {
    const innerW = width - padX * 2;
    ctx.save();

    // Top accent rule bar (subtle editorial masthead stripe)
    fillRoundRect(ctx, padX, y, 42, 4, 2, pal.accent);

    // Main title
    ctx.font = `700 24px ${FONT_SANS}`;
    ctx.fillStyle = pal.textPrimary;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(truncateText(ctx, info.title, innerW - 280), padX, y + 14);

    // Right-aligned source & sync timestamp
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.fillStyle = pal.textSecondary;
    ctx.textAlign = "right";
    ctx.fillText(`数据源：${info.sourceName}`, padX + innerW, y + 16);

    ctx.font = `500 11.5px ${FONT_MONO}`;
    ctx.fillStyle = pal.textMuted;
    ctx.fillText(`同步于 ${info.syncedAt}`, padX + innerW, y + 36);

    // Filter / context tags row
    let tx = padX;
    const tagY = y + 48;
    for (const tag of info.tags || []) {
      const w = drawPill(ctx, tx, tagY, tag.text, {
        bg: tag.accent ? pal.accentSoft : pal.bgSubtle,
        fg: tag.accent ? pal.accent : pal.textSecondary,
        border: tag.accent ? null : pal.border,
        font: `500 11.5px ${FONT_SANS}`,
        padX: 8,
        height: 22,
        radius: 5,
      });
      tx += w + 6;
      if (tx > padX + innerW - 120) break;
    }

    ctx.restore();
    return y + 84;
  }

  function drawPosterFooter(ctx, width, padX, y, pal, footerRight) {
    const innerW = width - padX * 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + innerW, y);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `500 11.5px ${FONT_SANS}`;
    ctx.fillStyle = pal.textMuted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      "数据来源：Artificial Analysis · LMArena",
      padX,
      y + 12
    );

    ctx.font = `500 11.5px ${FONT_MONO}`;
    ctx.textAlign = "right";
    ctx.fillText(footerRight || "slzx1.github.io/ai-llm-leaderboard", padX + innerW, y + 12);
    ctx.restore();
    return y + 36;
  }

  /* ========================================================================
     Section 1: Desktop Leaderboard Table Renderer (1280px logical width)
     ======================================================================== */

  function drawLeaderboardSection(ctx, x, y, w, pal, payload) {
    const {
      track,
      models,
      globalStats,
      paretoSet,
      sortKey,
      sortDir,
      hasVotes,
      helpers,
    } = payload;

    const cols = track.columns;
    const primaryCol = cols[0];
    const subCols = cols.slice(1);
    const totalSubCols = subCols.length + (hasVotes ? 1 : 0);

    const headH = 42;
    const rowH = 54;
    const totalH = headH + Math.max(1, models.length) * rowH;

    // Outer table card
    fillRoundRect(ctx, x, y, w, totalH, 12, pal.bgSurface, pal.border, 1);

    // Column layout across full desktop width (1208px)
    const colRankW = 58;
    const colModelW = totalSubCols >= 7 ? 290 : totalSubCols >= 5 ? 320 : 370;
    const colPrimaryW = 156;
    const remW = Math.max(120, w - colRankW - colModelW - colPrimaryW - 14);
    const subColW = totalSubCols > 0 ? remW / totalSubCols : 0;

    // Header background
    ctx.save();
    roundRectPath(ctx, x, y, w, totalH, 12);
    ctx.clip();

    ctx.fillStyle = pal.bgSubtle;
    ctx.fillRect(x, y, w, headH);
    ctx.beginPath();
    ctx.moveTo(x, y + headH);
    ctx.lineTo(x + w, y + headH);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header labels
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.textBaseline = "middle";
    const headMidY = y + headH / 2;

    ctx.fillStyle = pal.textSecondary;
    ctx.textAlign = "center";
    ctx.fillText("排名", x + colRankW / 2, headMidY);

    ctx.textAlign = "left";
    ctx.fillText("模型 & 官方厂商", x + colRankW + 8, headMidY);

    const arrow = (key) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");

    const pX = x + colRankW + colModelW;
    ctx.fillStyle = sortKey === primaryCol.key ? pal.accent : pal.textSecondary;
    ctx.fillText(truncateText(ctx, `${primaryCol.label}${arrow(primaryCol.key)}`, colPrimaryW - 12), pX + 8, headMidY);

    let sx = pX + colPrimaryW;
    for (const col of subCols) {
      ctx.fillStyle = sortKey === col.key ? pal.accent : pal.textSecondary;
      ctx.textAlign = "right";
      ctx.fillText(
        truncateText(ctx, `${col.label}${arrow(col.key)}`, subColW - 10),
        sx + subColW - 8,
        headMidY
      );
      sx += subColW;
    }

    if (hasVotes) {
      ctx.fillStyle = sortKey === "votes" ? pal.accent : pal.textSecondary;
      ctx.textAlign = "right";
      ctx.fillText(`盲测票数${arrow("votes")}`, sx + subColW - 8, headMidY);
    }

    // Empty state
    if (models.length === 0) {
      ctx.font = `500 14px ${FONT_SANS}`;
      ctx.fillStyle = pal.textMuted;
      ctx.textAlign = "center";
      ctx.fillText("当前筛选条件下暂无模型数据", x + w / 2, y + headH + rowH / 2);
      ctx.restore();
      return totalH;
    }

    // Rows
    const pGlobal = globalStats[primaryCol.key];
    models.forEach((m, idx) => {
      const ry = y + headH + idx * rowH;
      const midY = ry + rowH / 2;
      const displayRank = idx + 1;

      if (idx > 0) {
        ctx.beginPath();
        ctx.moveTo(x, ry);
        ctx.lineTo(x + w, ry);
        ctx.strokeStyle = pal.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Rank badge
      let rBg = "transparent";
      let rFg = pal.textSecondary;
      if (displayRank === 1) {
        rBg = pal.rank1Bg;
        rFg = pal.rank1Fg;
      } else if (displayRank === 2) {
        rBg = pal.rank2Bg;
        rFg = pal.rank2Fg;
      } else if (displayRank === 3) {
        rBg = pal.rank3Bg;
        rFg = pal.rank3Fg;
      }
      if (rBg !== "transparent") {
        fillRoundRect(ctx, x + colRankW / 2 - 14, midY - 12, 28, 24, 6, rBg);
      }
      ctx.font = `700 12.5px ${FONT_MONO}`;
      ctx.fillStyle = rFg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(displayRank), x + colRankW / 2, midY + 0.5);

      // Vendor official icon + Model name + meta pills
      const v = helpers.getVendor(m.vendor);
      const iconX = x + colRankW + 8;
      drawVendorIcon(ctx, v, iconX, midY - 14, 28, pal.isDark, pal, false);

      const textX = iconX + 37;
      const maxTextW = colModelW - 50;
      ctx.font = `600 13px ${FONT_SANS}`;
      ctx.fillStyle = pal.textPrimary;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncateText(ctx, m.name, maxTextW), textX, ry + 23);

      // Sub line: Vendor name + Open/Closed + Pareto + Context
      let metaX = textX;
      const metaY = ry + 39;
      ctx.font = `500 11px ${FONT_SANS}`;
      ctx.fillStyle = pal.textMuted;
      const vName = truncateText(ctx, v.name, 110);
      ctx.fillText(vName, metaX, metaY);
      metaX += ctx.measureText(vName).width + 6;

      const licW = drawPill(ctx, metaX, metaY - 11.5, m.isOpen ? "开源" : "闭源", {
        bg: m.isOpen ? pal.openBg : pal.propBg,
        fg: m.isOpen ? pal.openFg : pal.propFg,
        font: `600 10px ${FONT_SANS}`,
        padX: 5,
        height: 15,
        radius: 3.5,
      });
      metaX += licW + 5;

      if (paretoSet && paretoSet.has(m.id) && metaX + 54 < x + colRankW + colModelW - 4) {
        const pw = drawPill(ctx, metaX, metaY - 11.5, "帕累托最优", {
          bg: pal.accentSoftStrong,
          fg: pal.accent,
          font: `600 10px ${FONT_SANS}`,
          padX: 5,
          height: 15,
          radius: 3.5,
        });
        metaX += pw + 5;
      }

      if (m.contextLength && metaX + 34 < x + colRankW + colModelW - 4) {
        ctx.font = `500 10.5px ${FONT_MONO}`;
        ctx.fillStyle = pal.textMuted;
        ctx.textAlign = "left";
        ctx.fillText(helpers.formatContext(m.contextLength), metaX, metaY);
      }

      // Primary score + absolute progress bar
      const pVal = m.scores?.[primaryCol.key];
      const pct = helpers.computeAbsoluteBarPercent(pVal, primaryCol, pGlobal);
      const pTxt = helpers.formatColValue(pVal, primaryCol);
      ctx.font = `700 13.5px ${FONT_MONO}`;
      ctx.fillStyle = pal.textPrimary;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(pTxt, pX + 8, ry + 24);

      if (m.ci != null) {
        const wMain = ctx.measureText(pTxt).width;
        ctx.font = `500 10.5px ${FONT_MONO}`;
        ctx.fillStyle = pal.textMuted;
        ctx.fillText(` ±${m.ci}`, pX + 8 + wMain, ry + 24);
      }

      const barX = pX + 8;
      const barY = ry + 34;
      const barW = colPrimaryW - 22;
      fillRoundRect(ctx, barX, barY, barW, 5, 2.5, pal.barTrack);
      if (pct > 0) {
        fillRoundRect(ctx, barX, barY, Math.max(4, (barW * pct) / 100), 5, 2.5, pal.barFill);
      }

      // Sub-columns with full-track tier highlights
      let cx = pX + colPrimaryW;
      for (const col of subCols) {
        const val = m.scores?.[col.key];
        const cellRight = cx + subColW - 8;
        if (val == null) {
          ctx.font = `500 12px ${FONT_MONO}`;
          ctx.fillStyle = pal.textMuted;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText("—", cellRight, midY);
        } else {
          const cStat = globalStats[col.key];
          let tier = "";
          if (col.lowerIsBetter) {
            if (val <= cStat.top5) tier = "top";
            else if (val <= cStat.top15) tier = "high";
          } else {
            if (val >= cStat.top5) tier = "top";
            else if (val >= cStat.top15) tier = "high";
          }
          const txt = helpers.formatColValue(val, col);
          ctx.font = `${tier === "top" ? "700" : "500"} 12px ${FONT_MONO}`;
          const tw = ctx.measureText(txt).width;

          if (tier) {
            const pillW = tw + 12;
            fillRoundRect(
              ctx,
              cellRight - pillW + 4,
              midY - 11,
              pillW,
              22,
              5,
              tier === "top" ? pal.accentSoftStrong : pal.accentSoft
            );
          }

          ctx.fillStyle = tier === "top" ? pal.accent : pal.textPrimary;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, cellRight - 2, midY + 0.5);
        }
        cx += subColW;
      }

      if (hasVotes) {
        ctx.font = `500 12px ${FONT_MONO}`;
        ctx.fillStyle = pal.textSecondary;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(helpers.formatNumber(m.votes), cx + subColW - 8, midY + 0.5);
      }
    });

    ctx.restore();
    return totalH;
  }

  /* ========================================================================
     Section 2: Desktop Pareto Frontier Chart Renderer (1208px inner width)
     ======================================================================== */

  function drawParetoSection(ctx, x, y, w, h, pal, payload) {
    const { pareto, paretoScale, paretoOnly, helpers } = payload;
    const { cfg, valid, frontier, frontierSet } = pareto;

    fillRoundRect(ctx, x, y, w, h, 12, pal.bgSurface, pal.border, 1);

    // Header strip inside Pareto card
    const barH = 48;
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 12);
    ctx.clip();

    ctx.fillStyle = pal.bgSubtle;
    ctx.fillRect(x, y, w, barH);
    ctx.beginPath();
    ctx.moveTo(x, y + barH);
    ctx.lineTo(x + w, y + barH);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `700 14px ${FONT_SANS}`;
    ctx.fillStyle = pal.textPrimary;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${cfg.title}（${paretoScale === "log" ? "对数刻度" : "线性刻度"}）`, x + 18, y + barH / 2);

    // Right legend inside Pareto header (real colored legend dots)
    const midBarY = y + barH / 2;
    let rx = x + w - 18;
    ctx.font = `500 12px ${FONT_SANS}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const drawLegendText = (txt, color = pal.textSecondary) => {
      ctx.fillStyle = color;
      ctx.fillText(txt, rx, midBarY);
      rx -= ctx.measureText(txt).width;
    };
    const drawLegendDot = (fill, stroke) => {
      rx -= 9;
      ctx.beginPath();
      ctx.arc(rx, midBarY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      rx -= 12;
    };

    drawLegendText("开源");
    drawLegendDot(pal.dotOpen, pal.dotOpenStroke);
    drawLegendText("闭源");
    drawLegendDot(pal.dotClosed, pal.dotClosedStroke);
    drawLegendText(`前沿最优 ${frontier.length} 款 / 共 ${valid.length} 款模型  · `);

    if (valid.length === 0) {
      ctx.font = `500 14px ${FONT_SANS}`;
      ctx.fillStyle = pal.textMuted;
      ctx.textAlign = "center";
      ctx.fillText(`当前筛选条件下暂无有效「${cfg.shortLabel}」数据`, x + w / 2, y + barH + (h - barH) / 2);
      ctx.restore();
      return h;
    }

    const stageY = y + barH;
    const stageH = h - barH;
    const pad = { top: 28, right: 34, bottom: 52, left: 66 };
    const plotW = w - pad.left - pad.right;
    const plotH = stageH - pad.top - pad.bottom;

    const xs = valid.map((p) => p.x);
    const ys = valid.map((p) => p.y);
    const rawMinX = Math.min(...xs);
    const rawMaxX = Math.max(...xs);
    const rawMinY = Math.min(...ys);
    const rawMaxY = Math.max(...ys);

    const isLog = paretoScale === "log";
    const domMinX = isLog ? rawMinX * 0.82 : Math.max(0, rawMinX - (rawMaxX - rawMinX) * 0.06);
    const domMaxX = isLog ? rawMaxX * 1.24 : rawMaxX + Math.max(1, rawMaxX - rawMinX) * 0.08;
    const domMinY = Math.max(0, Math.floor((rawMinY - 4) / 5) * 5);
    const domMaxY = Math.min(100, Math.ceil((rawMaxY + 4) / 5) * 5);

    const mapX = (vx) => {
      if (isLog) {
        const lMin = Math.log10(Math.max(1e-4, domMinX));
        const lMax = Math.log10(Math.max(domMinX * 1.1, domMaxX));
        return x + pad.left + ((Math.log10(Math.max(1e-4, vx)) - lMin) / Math.max(1e-6, lMax - lMin)) * plotW;
      }
      return x + pad.left + ((vx - domMinX) / Math.max(1e-6, domMaxX - domMinX)) * plotW;
    };
    const mapY = (vy) =>
      stageY + pad.top + plotH - ((vy - domMinY) / Math.max(1e-6, domMaxY - domMinY)) * plotH;

    const xTicks = isLog ? helpers.niceLogTicks(domMinX, domMaxX) : helpers.niceLinearTicks(domMinX, domMaxX, 6);
    const yTicks = helpers.niceLinearTicks(domMinY, domMaxY, 5);

    // Gridlines & ticks
    ctx.font = `500 11px ${FONT_MONO}`;
    for (const yv of yTicks) {
      const py = mapY(yv);
      if (py < stageY + pad.top - 2 || py > stageY + pad.top + plotH + 2) continue;
      ctx.beginPath();
      ctx.moveTo(x + pad.left, py);
      ctx.lineTo(x + pad.left + plotW, py);
      ctx.strokeStyle = pal.gridLine;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = pal.textMuted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.round(yv)), x + pad.left - 10, py);
    }

    for (const xv of xTicks) {
      const px = mapX(xv);
      if (px < x + pad.left - 2 || px > x + pad.left + plotW + 2) continue;
      ctx.beginPath();
      ctx.moveTo(px, stageY + pad.top);
      ctx.lineTo(px, stageY + pad.top + plotH);
      ctx.strokeStyle = pal.gridLine;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = pal.textMuted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(helpers.formatAxisTick(xv, cfg.format), px, stageY + pad.top + plotH + 8);
    }

    // Axes lines
    ctx.beginPath();
    ctx.moveTo(x + pad.left, stageY + pad.top);
    ctx.lineTo(x + pad.left, stageY + pad.top + plotH);
    ctx.lineTo(x + pad.left + plotW, stageY + pad.top + plotH);
    ctx.strokeStyle = pal.axisLine;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Axis titles
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.fillStyle = pal.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(cfg.axisLabel, x + pad.left + plotW / 2, y + h - 10);

    ctx.save();
    ctx.translate(x + 20, stageY + pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("智力指数 (AA Index ↑)", 0, 0);
    ctx.restore();

    // Pareto shaded envelope & frontier polyline
    if (frontier.length >= 2) {
      const baseY = stageY + pad.top + plotH;
      ctx.beginPath();
      ctx.moveTo(mapX(frontier[0].x), baseY);
      frontier.forEach((pt) => ctx.lineTo(mapX(pt.x), mapY(pt.y)));
      ctx.lineTo(mapX(frontier[frontier.length - 1].x), baseY);
      ctx.closePath();
      ctx.fillStyle = pal.envelopeFill;
      ctx.fill();

      ctx.beginPath();
      frontier.forEach((pt, idx) => {
        const px = mapX(pt.x);
        const py = mapY(pt.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // Non-frontier scatter dots
    ctx.save();
    if (paretoOnly) ctx.globalAlpha = 0.22;
    for (const pt of valid) {
      if (frontierSet.has(pt.model.id)) continue;
      const cx = mapX(pt.x);
      const cy = mapY(pt.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = pt.model.isOpen ? pal.dotOpen : pal.dotClosed;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = pt.model.isOpen ? pal.dotOpenStroke : pal.dotClosedStroke;
      ctx.stroke();
    }
    ctx.restore();

    // Frontier icon nodes + collision-avoided labels
    const placedBoxes = [];
    const collides = (box) =>
      placedBoxes.some((b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2));

    const frontierCoords = frontier.map((pt) => {
      const px = mapX(pt.x);
      const py = mapY(pt.y);
      placedBoxes.push({ x1: px - 16, y1: py - 16, x2: px + 16, y2: py + 16 });
      return { ...pt, px, py };
    });

    const labelOrder = [...frontierCoords].sort((a, b) => b.y - a.y);
    const labelPlacements = new Map();

    for (const pt of labelOrder) {
      const shortLbl = pt.model.name.length > 24 ? `${pt.model.name.slice(0, 23)}…` : pt.model.name;
      const scoreTxt = helpers.formatColValue(pt.y, { format: "index" });
      ctx.font = `600 11.5px ${FONT_SANS}`;
      const nameW = ctx.measureText(shortLbl).width;
      ctx.font = `700 11px ${FONT_MONO}`;
      const scW = ctx.measureText(scoreTxt).width;
      const estW = Math.ceil(nameW + scW + 20);
      const estH = 22;

      const candidates = cfg.lowerIsBetter
        ? [
            { x: pt.px - estW - 19, y: pt.py - estH / 2 },
            { x: pt.px - estW - 8, y: pt.py - estH - 19 },
            { x: pt.px - estW / 2, y: pt.py - estH - 19 },
            { x: pt.px + 19, y: pt.py - estH / 2 },
            { x: pt.px - estW - 8, y: pt.py + 19 },
            { x: pt.px + 8, y: pt.py + 19 },
            { x: pt.px - estW / 2, y: pt.py + 19 },
          ]
        : [
            { x: pt.px + 19, y: pt.py - estH / 2 },
            { x: pt.px + 8, y: pt.py - estH - 19 },
            { x: pt.px - estW / 2, y: pt.py - estH - 19 },
            { x: pt.px - estW - 19, y: pt.py - estH / 2 },
            { x: pt.px - estW - 8, y: pt.py + 19 },
            { x: pt.px + 8, y: pt.py + 19 },
            { x: pt.px - estW / 2, y: pt.py + 19 },
          ];

      for (const cand of candidates) {
        const box = { x1: cand.x - 3, y1: cand.y - 2, x2: cand.x + estW + 3, y2: cand.y + estH + 2 };
        const inside =
          box.x1 >= x + pad.left - 8 &&
          box.x2 <= x + w - 8 &&
          box.y1 >= stageY + 6 &&
          box.y2 <= stageY + pad.top + plotH - 2;
        if (inside && !collides(box)) {
          placedBoxes.push(box);
          labelPlacements.set(pt.model.id, { x: cand.x, y: cand.y, w: estW, h: estH, shortLbl, scoreTxt });
          break;
        }
      }
    }

    // Draw frontier nodes & labels
    for (const pt of frontierCoords) {
      const v = helpers.getVendor(pt.model.vendor);
      ctx.save();
      ctx.shadowColor = pal.shadow;
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      drawVendorIcon(ctx, v, pt.px - 14, pt.py - 14, 28, pal.isDark, pal, true);
      ctx.restore();

      const lp = labelPlacements.get(pt.model.id);
      if (lp) {
        fillRoundRect(ctx, lp.x, lp.y, lp.w, lp.h, 5, pal.labelBg, pal.border, 1);
        ctx.font = `600 11.5px ${FONT_SANS}`;
        ctx.fillStyle = pal.textPrimary;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(lp.shortLbl, lp.x + 7, lp.y + lp.h / 2 + 0.5);

        ctx.font = `700 11px ${FONT_MONO}`;
        ctx.fillStyle = pal.accent;
        ctx.textAlign = "right";
        ctx.fillText(lp.scoreTxt, lp.x + lp.w - 7, lp.y + lp.h / 2 + 0.5);
      }
    }

    ctx.restore();
    return h;
  }

  /* ========================================================================
     Public Renderers (All Fixed Desktop-Width 2x Retina PNG Canvases)
     ======================================================================== */

  async function renderReportCanvas(opts) {
    const {
      mode, // "table" | "pareto" | "combined"
      track,
      models,
      globalStats,
      pareto,
      paretoScale,
      paretoOnly,
      sortKey,
      sortDir,
      hasVotes,
      isDark,
      headerInfo,
      helpers,
    } = opts;

    const pal = getPalette(isDark);
    const width = 1280;
    const padX = 36;
    const innerW = width - padX * 2;
    const scale = 2;

    // Preload all needed official vendor icons
    const vendorIds = [];
    if (mode !== "pareto") {
      models.forEach((m) => vendorIds.push(m.vendor));
    }
    if (pareto && (mode === "pareto" || mode === "combined")) {
      pareto.frontier.forEach((pt) => vendorIds.push(pt.model.vendor));
    }
    await preloadVendors(vendorIds, helpers.getVendor, isDark);

    // Measure exact total height
    const headerH = 84;
    const paretoH = mode === "pareto" ? 560 : mode === "combined" ? 490 : 0;
    const tableH = mode === "table" || mode === "combined" ? 42 + Math.max(1, models.length) * 54 : 0;
    const gapBetween = mode === "combined" ? 20 : 0;
    const footerH = 38;
    const totalH = 32 + headerH + 14 + paretoH + gapBetween + tableH + 22 + footerH + 20;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(totalH * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Canvas backdrop
    ctx.fillStyle = pal.bgCanvas;
    ctx.fillRect(0, 0, width, totalH);

    let cursorY = drawPosterHeader(ctx, width, padX, 32, pal, headerInfo) + 14;

    if (mode === "pareto" || mode === "combined") {
      cursorY += drawParetoSection(ctx, padX, cursorY, innerW, paretoH, pal, {
        pareto,
        paretoScale,
        paretoOnly,
        helpers,
      });
      if (mode === "combined") cursorY += gapBetween;
    }

    if (mode === "table" || mode === "combined") {
      cursorY += drawLeaderboardSection(ctx, padX, cursorY, innerW, pal, {
        track,
        models,
        globalStats,
        paretoSet: pareto ? pareto.frontierSet : null,
        sortKey,
        sortDir,
        hasVotes,
        helpers,
      });
    }

    drawPosterFooter(ctx, width, padX, cursorY + 22, pal);
    return canvas;
  }

  async function renderCompareCanvas(opts) {
    const {
      track,
      models,
      radarCols,
      stats,
      displayRankMap,
      isDark,
      headerInfo,
      helpers,
    } = opts;

    const pal = getPalette(isDark);
    const width = 1200; // Always desktop 2-column width
    const padX = 36;
    const innerW = width - padX * 2;
    const scale = 2;

    await preloadVendors(models.map((m) => m.vendor), helpers.getVendor, isDark);

    const cols = track.columns;
    const canRadar = radarCols && radarCols.length >= 3;
    const rowCount = cols.length + 2; // rank + license + all dimensions
    const tableHeadH = 54;
    const tableRowH = 38;
    const tableH = tableHeadH + rowCount * tableRowH;

    // Legend rows beneath radar
    const radarSize = 350;
    const legendH = Math.ceil(models.length / 2) * 26 + 24;
    const leftH = canRadar ? radarSize + legendH + 24 : 0;
    const cardBodyH = Math.max(tableH, leftH) + 32;
    const headerH = 84;
    const footerH = 38;
    const totalH = 32 + headerH + 14 + cardBodyH + 22 + footerH + 20;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(totalH * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = pal.bgCanvas;
    ctx.fillRect(0, 0, width, totalH);

    const cardY = drawPosterHeader(ctx, width, padX, 32, pal, headerInfo) + 14;
    fillRoundRect(ctx, padX, cardY, innerW, cardBodyH, 14, pal.bgSurface, pal.border, 1);

    const innerPad = 24;
    const leftW = canRadar ? 410 : 0;
    const gap = canRadar ? 24 : 0;

    // Left Column: Crisp Absolute-Scale Radar Chart + Legend
    if (canRadar) {
      const radarBoxX = padX + innerPad;
      const radarBoxY = cardY + Math.max(16, (cardBodyH - (radarSize + legendH)) / 2);
      const cx = radarBoxX + leftW / 2;
      const cy = radarBoxY + radarSize / 2;
      const r = 114;
      const n = radarCols.length;

      // Concentric absolute scale rings (25 / 50 / 75 / 100)
      for (let ring = 1; ring <= 4; ring++) {
        const rr = (r * ring) / 4;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = pal.gridLine;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        ctx.font = `500 10px ${FONT_MONO}`;
        ctx.fillStyle = pal.textMuted;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(ring * 25), cx + 5, cy - rr + 1);
      }

      // Axis spokes & labels
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.fillStyle = pal.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.strokeStyle = pal.gridLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        const lx = cx + Math.cos(ang) * (r + 30);
        const ly = cy + Math.sin(ang) * (r + 22);
        ctx.fillText(radarCols[i].label, lx, ly);
      }

      // Model polygons (absolute scale)
      models.forEach((m, mi) => {
        const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const col = radarCols[i];
          const val = m.scores?.[col.key];
          const norm =
            val != null ? Math.max(0.05, helpers.computeAbsoluteBarPercent(val, col, stats[col.key]) / 100) : 0.04;
          const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
          const px = cx + Math.cos(ang) * (r * norm);
          const py = cy + Math.sin(ang) * (r * norm);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.fillStyle = `${color}26`;
        ctx.fill();
      });

      // Legend items centered under radar
      const legStartY = radarBoxY + radarSize + 8;
      const colW = leftW / 2;
      models.forEach((m, mi) => {
        const colIdx = mi % 2;
        const rowIdx = Math.floor(mi / 2);
        const lx = radarBoxX + colIdx * colW + 8;
        const ly = legStartY + rowIdx * 26;
        const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
        fillRoundRect(ctx, lx, ly + 4, 11, 11, 3, color);
        ctx.font = `600 12px ${FONT_SANS}`;
        ctx.fillStyle = pal.textPrimary;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(truncateText(ctx, m.name, colW - 28), lx + 17, ly + 10);
      });

      // Vertical divider between radar and table
      const divX = radarBoxX + leftW + gap / 2;
      ctx.beginPath();
      ctx.moveTo(divX, cardY + 20);
      ctx.lineTo(divX, cardY + cardBodyH - 20);
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Right Column: Full Desktop Comparison Table
    const tblX = padX + innerPad + leftW + gap;
    const tblY = cardY + Math.max(16, (cardBodyH - tableH) / 2);
    const tblW = innerW - innerPad * 2 - leftW - gap;
    const labelColW = 112;
    const modelColW = (tblW - labelColW) / models.length;

    // Header row
    fillRoundRect(ctx, tblX, tblY, tblW, tableHeadH, 8, pal.bgSubtle);
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.fillStyle = pal.textSecondary;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("评测维度", tblX + 12, tblY + tableHeadH / 2);

    models.forEach((m, mi) => {
      const mx = tblX + labelColW + mi * modelColW;
      const color = COMPARE_COLORS[mi % COMPARE_COLORS.length];
      const v = helpers.getVendor(m.vendor);

      // Small icon + full model name on line 1 + color swatch & vendor name on line 2
      drawVendorIcon(ctx, v, mx + 6, tblY + 13, 24, pal.isDark, pal, false);

      ctx.font = `700 11.8px ${FONT_SANS}`;
      ctx.fillStyle = pal.textPrimary;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncateText(ctx, m.name, modelColW - 40), mx + 36, tblY + 22);

      fillRoundRect(ctx, mx + 36, tblY + 30, 8, 8, 2.5, color);
      ctx.font = `500 10.5px ${FONT_SANS}`;
      ctx.fillStyle = pal.textMuted;
      ctx.fillText(truncateText(ctx, v.name, modelColW - 52), mx + 48, tblY + 38);
    });

    // Data rows (Rank, License, + all columns)
    const rows = [
      {
        label: "当前排名",
        vals: models.map((m) => `#${displayRankMap?.get(m.id) ?? m.rank}`),
        bestIdx: -1,
        isMono: true,
      },
      {
        label: "协议类型",
        vals: models.map((m) => (m.isOpen ? "开源权重" : "闭源商业")),
        bestIdx: -1,
        isMono: false,
      },
      ...cols.map((col) => {
        const rawVals = models.map((m) => m.scores?.[col.key]);
        const nums = rawVals.filter((v) => v != null && !Number.isNaN(v));
        const bestVal = nums.length ? (col.lowerIsBetter ? Math.min(...nums) : Math.max(...nums)) : null;
        return {
          label: col.label,
          vals: rawVals.map((v) => (v != null ? helpers.formatColValue(v, col) : "—")),
          bestFlags: rawVals.map((v) => v != null && bestVal != null && v === bestVal),
          isMono: true,
        };
      }),
    ];

    rows.forEach((row, rIdx) => {
      const ry = tblY + tableHeadH + rIdx * tableRowH;
      const midY = ry + tableRowH / 2;

      ctx.beginPath();
      ctx.moveTo(tblX, ry + tableRowH);
      ctx.lineTo(tblX + tblW, ry + tableRowH);
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `500 12.5px ${FONT_SANS}`;
      ctx.fillStyle = pal.textSecondary;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(truncateText(ctx, row.label, labelColW - 18), tblX + 12, midY + 0.5);

      row.vals.forEach((txt, mi) => {
        const rightEdge = tblX + labelColW + (mi + 1) * modelColW - 12;
        const isBest = Boolean(row.bestFlags && row.bestFlags[mi]);
        ctx.font = `${isBest ? "700" : "500"} 12.5px ${row.isMono ? FONT_MONO : FONT_SANS}`;
        if (isBest) {
          const tw = ctx.measureText(txt).width;
          fillRoundRect(ctx, rightEdge - tw - 10, midY - 11, tw + 16, 22, 5, pal.accentSoftStrong);
          ctx.fillStyle = pal.accent;
        } else {
          ctx.fillStyle = txt === "—" ? pal.textMuted : pal.textPrimary;
        }
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, rightEdge - 2, midY + 0.5);
      });
    });

    drawPosterFooter(ctx, width, padX, cardY + cardBodyH + 22, pal);
    return canvas;
  }

  /* ========================================================================
     Blob / Download / Clipboard Utilities
     ======================================================================== */

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("生成 PNG 失败"));
      }, "image/png");
    });
  }

  async function downloadCanvas(canvas, filename) {
    if (window.AndroidBridge && typeof window.AndroidBridge.saveImage === "function") {
      const dataUrl = canvas.toDataURL("image/png");
      const ok = window.AndroidBridge.saveImage(dataUrl, filename);
      if (ok) return null;
    }
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return blob;
  }

  async function copyCanvasToClipboard(canvas) {
    if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
      return { ok: false, reason: "当前浏览器不支持直接复制图片，请点击「下载高清 PNG」" };
    }
    try {
      const blob = await canvasToBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true };
    } catch {
      return { ok: false, reason: "剪贴板写入被浏览器限制，请直接点击「下载高清 PNG」" };
    }
  }

  window.ModelRankExporter = {
    renderReportCanvas,
    renderCompareCanvas,
    canvasToBlob,
    downloadCanvas,
    copyCanvasToClipboard,
  };
})();
