#!/usr/bin/env python3
"""
Automated multi-dimensional AI LLM Leaderboard fetcher.

Sources:
1. LMArena Official HuggingFace Dataset (lmarena-ai/leaderboard-dataset)
   - text (overall, hard_prompts, coding, math, chinese, creative_writing, instruction_following, multi_turn, expert)
   - text_style_control (overall, hard_prompts, coding, math, chinese, creative_writing, instruction_following)
   - webdev (overall, webdev-react, webdev-html, image_to_webdev)
   - vision (overall, ocr, diagram, chinese, creative_writing, homework)
   - agent (overall)
   - search (overall)
   - text_to_image (overall, photorealistic, art, text_rendering, chinese, commercial_design)
   - text_to_video (overall)
2. LiveBench Official GitHub Repository (LiveBench/livebench.github.io)
   - Contamination-free objective benchmark across Reasoning, Coding, Agentic Coding, Mathematics, Data Analysis, Language, IF
3. OpenRouter Public Models API (openrouter.ai/api/v1/models)
   - Enriches matched models with context window length and API pricing (USD / 1M tokens)
"""

import csv
import io
import json
import math
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

pa.set_cpu_count(1)
pa.set_io_thread_count(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
ICONS_MANIFEST_PATH = ROOT / "assets" / "icons" / "manifest.json"
OUT_PATH = DATA_DIR / "leaderboard.json"

HEADERS = {"User-Agent": "ModelRank-Leaderboard-Sync/1.0 (+https://github.com/Slzx1/ai-llm-leaderboard)"}

VENDOR_METADATA = {
    "google": {"name": "Google", "nameZh": "谷歌", "country": "US"},
    "openai": {"name": "OpenAI", "nameZh": "OpenAI", "country": "US"},
    "anthropic": {"name": "Anthropic", "nameZh": "Anthropic", "country": "US"},
    "meta": {"name": "Meta", "nameZh": "Meta", "country": "US"},
    "deepseek": {"name": "DeepSeek", "nameZh": "深度求索", "country": "CN"},
    "xai": {"name": "xAI", "nameZh": "xAI", "country": "US"},
    "alibaba": {"name": "Alibaba", "nameZh": "阿里巴巴 / 通义千问", "country": "CN"},
    "bytedance": {"name": "ByteDance", "nameZh": "字节跳动 / 豆包", "country": "CN"},
    "tencent": {"name": "Tencent", "nameZh": "腾讯 / 混元", "country": "CN"},
    "baidu": {"name": "Baidu", "nameZh": "百度 / 文心", "country": "CN"},
    "zai": {"name": "Z.ai (Zhipu)", "nameZh": "智谱 AI", "country": "CN"},
    "zhipu": {"name": "Zhipu AI", "nameZh": "智谱 AI", "country": "CN"},
    "moonshot": {"name": "Moonshot AI", "nameZh": "月之暗面 / Kimi", "country": "CN"},
    "minimax": {"name": "MiniMax", "nameZh": "MiniMax", "country": "CN"},
    "stepfun": {"name": "StepFun", "nameZh": "阶跃星辰", "country": "CN"},
    "mistral": {"name": "Mistral AI", "nameZh": "Mistral AI", "country": "FR"},
    "cohere": {"name": "Cohere", "nameZh": "Cohere", "country": "CA"},
    "nvidia": {"name": "NVIDIA", "nameZh": "英伟达", "country": "US"},
    "microsoft": {"name": "Microsoft", "nameZh": "微软", "country": "US"},
    "microsoft-ai": {"name": "Microsoft AI", "nameZh": "微软 AI", "country": "US"},
    "amazon": {"name": "Amazon", "nameZh": "亚马逊 AWS", "country": "US"},
    "ibm": {"name": "IBM", "nameZh": "IBM", "country": "US"},
    "xiaomi": {"name": "Xiaomi", "nameZh": "小米", "country": "CN"},
    "meituan": {"name": "Meituan", "nameZh": "美团", "country": "CN"},
    "ant-group": {"name": "Ant Group", "nameZh": "蚂蚁集团", "country": "CN"},
    "allenai": {"name": "AllenAI (Ai2)", "nameZh": "艾伦人工智能研究所", "country": "US"},
    "upstage": {"name": "Upstage", "nameZh": "Upstage", "country": "KR"},
    "perplexity": {"name": "Perplexity", "nameZh": "Perplexity", "country": "US"},
    "reflection": {"name": "Reflection", "nameZh": "Reflection", "country": "US"},
    "inception-ai": {"name": "Inception", "nameZh": "Inception Labs", "country": "US"},
    "arcee-ai": {"name": "Arcee AI", "nameZh": "Arcee AI", "country": "US"},
    "poolside": {"name": "Poolside", "nameZh": "Poolside", "country": "US"},
    "kling": {"name": "Kling AI", "nameZh": "快手可灵", "country": "CN"},
    "kwaikat": {"name": "KwaiKAT", "nameZh": "快手 KwaiKAT", "country": "CN"},
    "bfl": {"name": "Black Forest Labs", "nameZh": "Black Forest Labs", "country": "DE"},
    "stability ai": {"name": "Stability AI", "nameZh": "Stability AI", "country": "UK"},
    "ideogram": {"name": "Ideogram", "nameZh": "Ideogram", "country": "CA"},
    "recraft": {"name": "Recraft", "nameZh": "Recraft", "country": "UK"},
    "runway": {"name": "Runway", "nameZh": "Runway", "country": "US"},
    "luma-ai": {"name": "Luma AI", "nameZh": "Luma AI", "country": "US"},
    "pika": {"name": "Pika", "nameZh": "Pika", "country": "US"},
    "krea": {"name": "Krea", "nameZh": "Krea", "country": "US"},
    "reve": {"name": "Reve", "nameZh": "Reve", "country": "US"},
    "skyreel": {"name": "SkyReels", "nameZh": "昆仑万维 SkyReels", "country": "CN"},
    "synlan": {"name": "iFlytek Spark", "nameZh": "讯飞星火", "country": "CN"},
    "thinky": {"name": "Thinking Machines", "nameZh": "Thinking Machines", "country": "US"},
    "diffbot": {"name": "Diffbot", "nameZh": "Diffbot", "country": "US"},
    "genmo": {"name": "Genmo", "nameZh": "Genmo", "country": "US"},
    "hidream": {"name": "HiDream", "nameZh": "智象未来 HiDream", "country": "CN"},
    "kandinsky": {"name": "Kandinsky (Sber)", "nameZh": "Sber Kandinsky", "country": "RU"},
    "leonardo-ai": {"name": "Leonardo.Ai", "nameZh": "Leonardo.Ai", "country": "AU"},
    "unisound": {"name": "Unisound", "nameZh": "云知声", "country": "CN"},
    "aorizon": {"name": "Aorizon", "nameZh": "Aorizon", "country": "US"},
    "pixverse": {"name": "PixVerse", "nameZh": "爱诗科技 PixVerse", "country": "CN"},
    "lightricks": {"name": "Lightricks", "nameZh": "Lightricks (LTX)", "country": "IL"},
    "pruna": {"name": "Pruna AI", "nameZh": "Pruna AI", "country": "DE"},
}


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_json(url: str, timeout: int = 30):
    return json.loads(fetch_bytes(url, timeout=timeout).decode("utf-8"))


def norm_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def is_open_license(lic: str) -> bool:
    if not lic:
        return False
    low = lic.lower().strip()
    if low in ("proprietary", "unknown", "api", "closed", "commercial"):
        return False
    return True


def safe_round(val, digits=1):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    return round(float(val), digits)


def infer_vendor_from_name(name: str) -> str:
    low = name.lower()
    rules = [
        ("claude", "anthropic"),
        ("gpt", "openai"),
        ("o1", "openai"),
        ("o3", "openai"),
        ("o4", "openai"),
        ("chatgpt", "openai"),
        ("sora", "openai"),
        ("gemini", "google"),
        ("gemma", "google"),
        ("imagen", "google"),
        ("veo", "google"),
        ("deepseek", "deepseek"),
        ("qwen", "alibaba"),
        ("qwq", "alibaba"),
        ("wan", "alibaba"),
        ("llama", "meta"),
        ("muse", "meta"),
        ("grok", "xai"),
        ("glm", "zai"),
        ("kimi", "moonshot"),
        ("minimax", "minimax"),
        ("hailuo", "minimax"),
        ("doubao", "bytedance"),
        ("seed", "bytedance"),
        ("ernie", "baidu"),
        ("hunyuan", "tencent"),
        ("step", "stepfun"),
        ("mistral", "mistral"),
        ("mixtral", "mistral"),
        ("codestral", "mistral"),
        ("devstral", "mistral"),
        ("command", "cohere"),
        ("nova", "amazon"),
        ("phi", "microsoft"),
        ("mai-", "microsoft-ai"),
        ("nemotron", "nvidia"),
        ("mimo", "xiaomi"),
        ("longcat", "meituan"),
        ("ling-", "ant-group"),
        ("ring-", "ant-group"),
        ("olmo", "allenai"),
        ("solar", "upstage"),
        ("sonar", "perplexity"),
        ("flux", "bfl"),
        ("kling", "kling"),
        ("kat-", "kwaikat"),
        ("granite", "ibm"),
        ("stable diffusion", "stability ai"),
        ("pixverse", "pixverse"),
        ("ltx-", "lightricks"),
        ("p-image", "pruna"),
        ("p-video", "pruna"),
    ]
    for prefix, vendor in rules:
        if prefix in low:
            return vendor
    return "unknown"


def normalize_org(org: str, model_name: str = "") -> str:
    if not org:
        return infer_vendor_from_name(model_name)
    key = org.strip().lower()
    aliases = {
        "zhipu": "zai",
        "zhipu ai": "zai",
        "z.ai": "zai",
        "microsoft ai": "microsoft",
        "microsoft-ai": "microsoft",
        "stability-ai": "stability ai",
        "stability": "stability ai",
        "black forest labs": "bfl",
        "allen ai": "allenai",
        "moonshot ai": "moonshot",
        "mistral ai": "mistral",
    }
    return aliases.get(key, key)


def load_openrouter_enrichment():
    """Fetch OpenRouter model metadata (context_length & pricing per 1M tokens)."""
    index = {}
    try:
        payload = fetch_json("https://openrouter.ai/api/v1/models", timeout=20)
        for m in payload.get("data", []):
            ctx = m.get("context_length")
            pr = m.get("pricing") or {}
            try:
                pin = float(pr.get("prompt", -1)) * 1_000_000
                pout = float(pr.get("completion", -1)) * 1_000_000
            except (TypeError, ValueError):
                pin, pout = -1, -1

            entry = {
                "contextLength": int(ctx) if ctx else None,
                "pricing": (
                    {"input": round(pin, 2), "output": round(pout, 2)}
                    if pin >= 0 and pout >= 0
                    else None
                ),
            }
            slug = (m.get("id") or "").split("/")[-1]
            name = (m.get("name") or "").split(":")[-1].strip()
            for candidate in (slug, name):
                k = norm_key(candidate)
                if k and k not in index:
                    index[k] = entry
        print(f"[OpenRouter] Loaded {len(index)} model metadata entries")
    except Exception as e:
        print(f"[OpenRouter] Warning: failed to fetch metadata ({e})")
    return index


def match_openrouter(model_name: str, or_index: dict):
    if not or_index:
        return None
    clean = re.sub(r"\s*\((high|max|medium|low|xhigh|minimal|thinking|preview|latest)\)\s*", "", model_name, flags=re.I)
    for cand in (model_name, clean):
        k = norm_key(cand)
        if k in or_index:
            return or_index[k]
    return None


def fetch_lmarena_config(config_name: str):
    url = (
        "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/"
        f"resolve/refs%2Fconvert%2Fparquet/{config_name}/latest/0000.parquet"
    )
    raw = fetch_bytes(url, timeout=40)
    table = pq.read_table(io.BytesIO(raw), use_threads=False)
    return table.to_pylist()


def build_lmarena_track(
    track_id: str,
    config_name: str,
    name: str,
    short_name: str,
    description: str,
    columns_spec: list,
    max_models: int = 180,
    or_index: dict = None,
):
    rows = fetch_lmarena_config(config_name)
    publish_dates = sorted({str(r.get("leaderboard_publish_date")) for r in rows if r.get("leaderboard_publish_date")})
    publish_date = publish_dates[-1] if publish_dates else ""

    wanted_cats = [c["key"] for c in columns_spec]
    primary_cat = wanted_cats[0]

    by_model = {}
    scores_by_model = defaultdict(dict)

    for r in rows:
        cat = r.get("category")
        if cat not in wanted_cats:
            continue
        mname = r.get("model_name")
        if not mname:
            continue
        rating = safe_round(r.get("rating"), 1)
        if rating is None:
            continue

        scores_by_model[mname][cat] = rating
        if cat == primary_cat:
            upper = r.get("rating_upper")
            lower = r.get("rating_lower")
            ci = None
            if upper is not None and lower is not None:
                ci = safe_round((float(upper) - float(lower)) / 2.0, 1)
            votes = r.get("vote_count")
            by_model[mname] = {
                "id": re.sub(r"[^a-z0-9]+", "-", mname.lower()).strip("-"),
                "name": mname,
                "vendor": normalize_org(r.get("organization"), mname),
                "license": r.get("license") or "Unknown",
                "isOpen": is_open_license(r.get("license")),
                "rank": int(r["rank"]) if r.get("rank") is not None else None,
                "score": rating,
                "ci": ci,
                "votes": int(round(float(votes))) if votes is not None and not math.isnan(float(votes)) else None,
            }

    models = []
    for mname, item in by_model.items():
        item["scores"] = scores_by_model[mname]
        enr = match_openrouter(mname, or_index)
        if enr:
            if enr.get("contextLength"):
                item["contextLength"] = enr["contextLength"]
            if enr.get("pricing"):
                item["pricing"] = enr["pricing"]
        models.append(item)

    models.sort(key=lambda x: (-x["score"], x["rank"] if x["rank"] is not None else 9999))
    models = models[:max_models]
    for idx, m in enumerate(models, start=1):
        m["rank"] = idx

    print(f"[LMArena:{config_name}] Built {len(models)} models (date={publish_date})")
    return {
        "id": track_id,
        "name": name,
        "shortName": short_name,
        "source": "lmarena",
        "sourceConfig": config_name,
        "publishDate": publish_date,
        "scoreLabel": columns_spec[0]["label"],
        "scoreUnit": "Elo",
        "description": description,
        "columns": columns_spec,
        "models": models,
    }


def fetch_livebench_track(or_index: dict):
    """Auto-discover the newest table_YYYY_MM_DD.csv & categories JSON from LiveBench GitHub."""
    contents = fetch_json("https://api.github.com/repos/LiveBench/livebench.github.io/contents/public", timeout=20)
    tables = sorted(f["name"] for f in contents if re.match(r"^table_\d{4}_\d{2}_\d{2}\.csv$", f["name"]))
    cats_files = sorted(f["name"] for f in contents if re.match(r"^categories_\d{4}_\d{2}_\d{2}\.json$", f["name"]))
    if not tables or not cats_files:
        raise RuntimeError("No LiveBench table/categories files found")

    latest_table = tables[-1]
    release_date = latest_table.replace("table_", "").replace(".csv", "").replace("_", "-")
    matching_cat = f"categories_{release_date.replace('-', '_')}.json"
    cat_file = matching_cat if matching_cat in cats_files else cats_files[-1]

    csv_text = fetch_bytes(
        f"https://raw.githubusercontent.com/LiveBench/livebench.github.io/main/public/{latest_table}",
        timeout=20,
    ).decode("utf-8")
    categories = fetch_json(
        f"https://raw.githubusercontent.com/LiveBench/livebench.github.io/main/public/{cat_file}",
        timeout=20,
    )

    cat_zh = {
        "Reasoning": "逻辑推理",
        "Coding": "代码生成",
        "Agentic Coding": "Agent 编程",
        "Mathematics": "数学竞赛",
        "Data Analysis": "数据分析",
        "Language": "语言理解",
        "IF": "指令遵循",
    }

    columns = [{"key": "global_avg", "label": "综合均分", "primary": True}]
    cat_keys = list(categories.keys())
    for ck in cat_keys:
        columns.append({"key": ck, "label": cat_zh.get(ck, ck)})

    models = []
    for row in csv.DictReader(io.StringIO(csv_text)):
        mname = (row.get("model") or "").strip()
        if not mname:
            continue
        scores = {}
        cat_vals = []
        for ck, tasks in categories.items():
            vals = []
            for task in tasks:
                raw_v = row.get(task)
                if raw_v not in (None, "", "NaN"):
                    try:
                        vals.append(float(raw_v))
                    except ValueError:
                        pass
            if vals:
                avg = round(sum(vals) / len(vals), 2)
                scores[ck] = avg
                cat_vals.append(avg)
        if not cat_vals:
            continue
        global_avg = round(sum(cat_vals) / len(cat_vals), 2)
        scores["global_avg"] = global_avg

        vendor = infer_vendor_from_name(mname)
        is_open = any(k in mname.lower() for k in ("deepseek", "qwen", "llama", "olmo", "gemma", "glm", "kimi", "mimo"))
        # Proprietary exceptions
        if any(k in mname.lower() for k in ("qwen3.6-plus", "qwen3.7-max", "qwen3.8-max")):
            is_open = False

        item = {
            "id": re.sub(r"[^a-z0-9]+", "-", mname.lower()).strip("-"),
            "name": mname,
            "vendor": vendor,
            "license": "Open Weights" if is_open else "Proprietary",
            "isOpen": is_open,
            "rank": 0,
            "score": global_avg,
            "ci": None,
            "votes": None,
            "scores": scores,
        }
        enr = match_openrouter(mname, or_index)
        if enr:
            if enr.get("contextLength"):
                item["contextLength"] = enr["contextLength"]
            if enr.get("pricing"):
                item["pricing"] = enr["pricing"]
        models.append(item)

    models.sort(key=lambda x: -x["score"])
    for idx, m in enumerate(models, start=1):
        m["rank"] = idx

    print(f"[LiveBench] Built {len(models)} models (release={release_date})")
    return {
        "id": "livebench",
        "name": "LiveBench 客观无污染榜",
        "shortName": "LiveBench 客观",
        "source": "livebench",
        "sourceConfig": latest_table,
        "publishDate": release_date,
        "scoreLabel": "综合均分",
        "scoreUnit": "分",
        "description": "LiveBench 抗数据污染客观基准（ICLR 2025 Spotlight），全自动客观评分，涵盖逻辑推理、代码、Agent 编程、数学、数据分析、语言与指令遵循。",
        "columns": columns,
        "models": models,
    }


def build_lmarena_agent_track(or_index: dict):
    """Build multi-dimensional Agent Arena track from LMArena agent + sub-capability configs."""
    base_rows = fetch_lmarena_config("agent")
    publish_dates = sorted({str(r.get("leaderboard_publish_date")) for r in base_rows if r.get("leaderboard_publish_date")})
    publish_date = publish_dates[-1] if publish_dates else ""

    sub_configs = [
        ("capability", "agent_capability", "index_score", 1.0, "能力指数"),
        ("task_outcome", "agent_task_outcome", "index_score", 1.0, "任务完成"),
        ("tool_efficiency", "agent_tool_efficiency", "index_score", 1.0, "工具效率"),
        ("bash_reliability", "agent_bash_reliability", "score", 100.0, "终端可靠"),
        ("steerability", "agent_steerability", "score", 100.0, "可控性"),
    ]
    sub_maps = {}
    for key, cfg_name, field, scale, _label in sub_configs:
        m = {}
        try:
            for r in fetch_lmarena_config(cfg_name):
                mn = r.get("model_name")
                val = r.get(field)
                if mn and val is not None:
                    v = safe_round(float(val) * scale, 1)
                    if v is not None:
                        m[mn] = v
        except Exception as e:
            print(f"[LMArena:{cfg_name}] Warn: {e}")
        sub_maps[key] = m

    models = []
    for r in base_rows:
        mname = r.get("model_name")
        raw_score = r.get("score")
        if not mname or raw_score is None:
            continue
        overall = safe_round(float(raw_score) * 100.0, 1)
        if overall is None:
            continue
        lo = r.get("score_ci_lower")
        hi = r.get("score_ci_upper")
        ci = safe_round((float(hi) - float(lo)) * 50.0, 1) if lo is not None and hi is not None else None
        sessions = r.get("session_count")
        scores = {"overall": overall}
        for key, _cfg, _f, _s, _lbl in sub_configs:
            if mname in sub_maps[key]:
                scores[key] = sub_maps[key][mname]

        item = {
            "id": re.sub(r"[^a-z0-9]+", "-", mname.lower()).strip("-"),
            "name": mname,
            "vendor": normalize_org(r.get("organization"), mname),
            "license": r.get("license") or "Unknown",
            "isOpen": is_open_license(r.get("license")),
            "rank": int(r["rank"]) if r.get("rank") is not None else None,
            "score": overall,
            "ci": ci,
            "votes": int(round(float(sessions))) if sessions is not None and not math.isnan(float(sessions)) else None,
            "scores": scores,
        }
        enr = match_openrouter(mname, or_index)
        if enr:
            if enr.get("contextLength"):
                item["contextLength"] = enr["contextLength"]
            if enr.get("pricing"):
                item["pricing"] = enr["pricing"]
        models.append(item)

    models.sort(key=lambda x: (-x["score"], x["rank"] if x["rank"] is not None else 9999))
    for idx, m in enumerate(models, start=1):
        m["rank"] = idx

    columns = [{"key": "overall", "label": "Agent 综合", "primary": True}] + [
        {"key": key, "label": label} for key, _c, _f, _s, label in sub_configs
    ]
    print(f"[LMArena:agent] Built {len(models)} models (date={publish_date})")
    return {
        "id": "agent",
        "name": "Agent 智能体实战榜",
        "shortName": "Agent 智能体",
        "source": "lmarena",
        "sourceConfig": "agent",
        "publishDate": publish_date,
        "scoreLabel": "Agent 综合",
        "scoreUnit": "分",
        "description": "LMArena Agent Arena 真实环境盲测排行，从综合表现、能力指数、任务完成度、工具调用效率、终端可靠性与可控性 6 大维度评估自主 Agent 能力。",
        "columns": columns,
        "models": models,
    }


def main():
    icon_manifest = {}
    if ICONS_MANIFEST_PATH.exists():
        icon_manifest = json.loads(ICONS_MANIFEST_PATH.read_text(encoding="utf-8"))

    or_index = load_openrouter_enrichment()

    tracks = {}
    publish_dates = {}

    lmarena_specs = [
        (
            "text",
            "text",
            "综合文本多维榜",
            "综合文本",
            "LMArena 官方盲测综合 Elo 排行，同表直观呈现复杂难题、编程、数学、中文、创意写作与指令遵循 7 大核心能力维度。",
            [
                {"key": "overall", "label": "综合 Elo", "primary": True},
                {"key": "hard_prompts", "label": "复杂难题"},
                {"key": "coding", "label": "编程能力"},
                {"key": "math", "label": "数学推理"},
                {"key": "chinese", "label": "中文能力"},
                {"key": "creative_writing", "label": "创意写作"},
                {"key": "instruction_following", "label": "指令遵循"},
            ],
            200,
        ),
        (
            "text_style_control",
            "text_style_control",
            "去风格控制榜 (Style Control)",
            "去风格控制",
            "剔除回答长度、Markdown 排版等表面风格偏好影响后的纯实力 Elo 排行，更真实反映模型内核推理与内容质量。",
            [
                {"key": "overall", "label": "去风格 Elo", "primary": True},
                {"key": "hard_prompts", "label": "复杂难题"},
                {"key": "coding", "label": "编程能力"},
                {"key": "math", "label": "数学推理"},
                {"key": "chinese", "label": "中文能力"},
                {"key": "instruction_following", "label": "指令遵循"},
            ],
            150,
        ),
        (
            "webdev",
            "webdev",
            "Web 开发与前端工程榜",
            "Web 开发",
            "LMArena WebDev Arena 盲测排行，真实检验模型从零编写交互式网页、React / HTML 应用及视觉还原的前端工程能力。",
            [
                {"key": "overall", "label": "WebDev Elo", "primary": True},
                {"key": "webdev-react", "label": "React 应用"},
                {"key": "webdev-html", "label": "HTML/CSS"},
                {"key": "image_to_webdev", "label": "识图建站"},
            ],
            120,
        ),
        (
            "vision",
            "vision",
            "多模态视觉理解榜",
            "多模态视觉",
            "LMArena Vision Arena 盲测排行，评估大模型在图像理解、OCR 文字识别、图表解析、中文视觉与学科解题中的表现。",
            [
                {"key": "overall", "label": "视觉 Elo", "primary": True},
                {"key": "ocr", "label": "OCR 识别"},
                {"key": "diagram", "label": "图表解析"},
                {"key": "chinese", "label": "中文视觉"},
                {"key": "homework", "label": "学科解题"},
                {"key": "captioning", "label": "图像描述"},
            ],
            120,
        ),
        (
            "search",
            "search",
            "联网搜索与事实问答榜",
            "联网搜索",
            "LMArena Search Arena 盲测排行，衡量模型结合实时网络检索进行准确、低幻觉信息综合的能力。",
            [
                {"key": "overall", "label": "Search Elo", "primary": True},
            ],
            100,
        ),
        (
            "text_to_image",
            "text_to_image",
            "文生图视觉创作榜",
            "图像生成",
            "LMArena Text-to-Image Arena 盲测排行，覆盖写实摄影、艺术创作、文字渲染、中文提示词与商业设计维度。",
            [
                {"key": "overall", "label": "综合 Elo", "primary": True},
                {"key": "photorealistic", "label": "写实摄影"},
                {"key": "text_rendering", "label": "文字渲染"},
                {"key": "chinese", "label": "中文提示"},
                {"key": "commercial_design", "label": "商业设计"},
                {"key": "art", "label": "艺术风格"},
            ],
            100,
        ),
        (
            "text_to_video",
            "text_to_video",
            "文生视频生成榜",
            "视频生成",
            "LMArena Text-to-Video Arena 盲测排行，评估视频生成模型的画面物理一致性、运动流畅度与提示词遵循度。",
            [
                {"key": "overall", "label": "视频 Elo", "primary": True},
            ],
            80,
        ),
    ]

    for spec in lmarena_specs:
        try:
            track = build_lmarena_track(*spec, or_index=or_index)
            tracks[track["id"]] = track
            publish_dates[track["id"]] = track["publishDate"]
        except Exception as e:
            print(f"[ERROR] Failed LMArena track {spec[0]}: {e}", file=sys.stderr)

    try:
        agent_track = build_lmarena_agent_track(or_index=or_index)
        tracks["agent"] = agent_track
        publish_dates["agent"] = agent_track["publishDate"]
    except Exception as e:
        print(f"[ERROR] Failed LMArena agent track: {e}", file=sys.stderr)

    livebench_release = ""
    try:
        lb = fetch_livebench_track(or_index)
        tracks["livebench"] = lb
        livebench_release = lb["publishDate"]
    except Exception as e:
        print(f"[WARN] Failed LiveBench track: {e}", file=sys.stderr)

    # Assemble vendor registry for all vendors appearing in any track
    seen_vendors = set()
    for t in tracks.values():
        for m in t["models"]:
            seen_vendors.add(m["vendor"])

    vendors = {}
    for v in sorted(seen_vendors):
        meta = VENDOR_METADATA.get(v, {"name": v.title(), "nameZh": v.title(), "country": ""})
        ic = icon_manifest.get(v) or icon_manifest.get(v.lower()) or {}
        vendors[v] = {
            "id": v,
            "name": meta["name"],
            "nameZh": meta["nameZh"],
            "country": meta.get("country", ""),
            "icon": ic.get("icon", ""),
            "mono": bool(ic.get("mono", False)),
            "iconSource": ic.get("source", ""),
        }

    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scheduleCron": "0 */6 * * *",
            "scheduleIntervalHours": 6,
            "scheduleLabel": "每 6 小时由 GitHub Actions 定时自动抓取更新",
            "trackOrder": [
                "text",
                "text_style_control",
                "webdev",
                "vision",
                "agent",
                "search",
                "livebench",
                "text_to_image",
                "text_to_video",
            ],
            "sources": [
                {
                    "id": "lmarena",
                    "name": "LMArena (Chatbot Arena)",
                    "url": "https://lmarena.ai/leaderboard",
                    "datasetUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
                    "description": "全球最具公信力的匿名盲测人类偏好 Elo 排行榜（LMSYS / UC Berkeley），公开数据集托管于 Hugging Face。",
                    "publishDates": publish_dates,
                },
                {
                    "id": "livebench",
                    "name": "LiveBench",
                    "url": "https://livebench.ai/",
                    "datasetUrl": "https://github.com/LiveBench/livebench.github.io",
                    "description": "ICLR 2025 Spotlight 抗污染客观评测基准，定期刷新考题并采用全自动客观判分。",
                    "release": livebench_release,
                },
                {
                    "id": "openrouter",
                    "name": "OpenRouter API",
                    "url": "https://openrouter.ai/models",
                    "datasetUrl": "https://openrouter.ai/api/v1/models",
                    "description": "补充模型上下文窗口（Context Length）与参考 API 价格（每百万 Tokens 美元）。",
                },
            ],
        },
        "vendors": vendors,
        "tracks": tracks,
    }

    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\n[DONE] Wrote {OUT_PATH} ({size_kb:.1f} KB), {len(tracks)} tracks, {len(vendors)} vendors.")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    os._exit(0)
