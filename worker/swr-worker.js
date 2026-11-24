/**
 * Cloudflare Worker — True Edge SWR (Stale-While-Revalidate) Proxy for ModelRank
 *
 * Serves cached leaderboard JSON at the edge immediately (0ms upstream wait),
 * and revalidates in the background via ctx.waitUntil() whenever cache age > FRESH_TTL_SEC.
 *
 * Deploy:
 *   cd worker && npx wrangler deploy
 * Then pass ?api=https://<your-worker>.workers.dev to the frontend (or set EDGE_SWR_ENDPOINT in scripts/app.js).
 */

const FRESH_TTL_SEC = 900; // 15 minutes fresh window
const STALE_TTL_SEC = 86400; // 24 hours stale-while-revalidate fallback
const GITHUB_RAW_JSON = "https://raw.githubusercontent.com/Slzx1/ai-llm-leaderboard/main/data/leaderboard.json";
const AA_URL = "https://artificialanalysis.ai/leaderboards/models";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function extractInitialModels(html) {
  const regex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let joined = "";
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      joined += JSON.parse(`"${m[1]}"`);
    } catch {
      // skip malformed chunk
    }
  }
  const idx = joined.indexOf('"initialModels":[{"id":');
  if (idx === -1) return null;
  const arrStart = joined.indexOf("[", idx);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = arrStart; i < joined.length; i++) {
    const ch = joined[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          return JSON.parse(joined.slice(arrStart, i + 1));
        }
      }
    }
  }
  return null;
}

async function buildFreshPayload() {
  // Fetch base snapshot (includes LMArena tracks + vendor icon manifest) and live AA models in parallel
  const [baseResp, aaResp] = await Promise.all([
    fetch(GITHUB_RAW_JSON, { cf: { cacheTtl: 120 } }),
    fetch(AA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ModelRank-SWR-Edge/1.0)",
      },
    }),
  ]);
  if (!baseResp.ok) throw new Error(`Base snapshot HTTP ${baseResp.status}`);
  const payload = await baseResp.json();

  if (aaResp.ok) {
    const html = await aaResp.text();
    const aaModels = extractInitialModels(html);
    if (Array.isArray(aaModels) && aaModels.length > 50) {
      payload.meta.edgeVerifiedAt = new Date().toISOString();
      payload.meta.edgeModelCount = aaModels.length;
      payload.meta.refreshStrategy = "Cloudflare Edge SWR (15m TTL)";
    }
  }
  return payload;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/leaderboard.json`, { method: "GET" });

    if (!force) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const fetchedAt = Number(cached.headers.get("X-SWR-Fetched-At") || 0);
        const ageSec = (Date.now() - fetchedAt) / 1000;
        const headers = new Headers(cached.headers);
        headers.set("X-SWR-Status", ageSec > FRESH_TTL_SEC ? "STALE-REVALIDATING" : "HIT");

        if (ageSec > FRESH_TTL_SEC) {
          ctx.waitUntil(
            buildFreshPayload()
              .then((data) => {
                const fresh = new Response(JSON.stringify(data), {
                  headers: {
                    ...CORS_HEADERS,
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": `public, max-age=${FRESH_TTL_SEC}, stale-while-revalidate=${STALE_TTL_SEC}`,
                    "X-SWR-Fetched-At": String(Date.now()),
                  },
                });
                return cache.put(cacheKey, fresh);
              })
              .catch(() => {})
          );
        }
        return new Response(cached.body, { status: 200, headers });
      }
    }

    const data = await buildFreshPayload();
    const body = JSON.stringify(data);
    const resp = new Response(body, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${FRESH_TTL_SEC}, stale-while-revalidate=${STALE_TTL_SEC}`,
        "X-SWR-Fetched-At": String(Date.now()),
        "X-SWR-Status": force ? "FORCED-REFRESH" : "MISS",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};
