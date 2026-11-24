#!/usr/bin/env python3
"""
Automated multi-dimensional AI LLM Leaderboard fetcher.

Primary Source:
1. Artificial Analysis (https://artificialanalysis.ai/leaderboards/models)
   - Artificial Analysis Intelligence Index v5 (290+ models including Claude Fable 5.2, GPT-6.2 Astra/Sol, Gemini 4, Kimi K3.1, Qwen4, DeepSeek V4.1, Grok 4.7, etc.)
   - Multi-dimensional tracks:
     * aa_intelligence: Intelligence Index v5 + FrontierCode 2.0, Terminal-Bench 4.0, HLE Diamond, CritPt v2 Hard, AA-Briefcase, AutomationBench, Speed, Price
     * aa_coding: Coding & Agentic Benchmarks
     * aa_reasoning: Hard Reasoning & Scientific Benchmarks
     * aa_knowledge: Omniscience Knowledge & Non-Hallucination
     * aa_efficiency: Output Speed (tok/s), Latency (TTFT), Pricing ($/1M), Cost per Task

Complementary Human Blind-Test Source:
2. LMArena Official HuggingFace Dataset (lmarena-ai/leaderboard-dataset)
   - lmarena_text: Human Preference Elo (Overall, Hard Prompts, Coding, Math, Chinese, Creative, IF)
   - lmarena_agent: Agent Arena (6 sub-dimensions)
   - lmarena_webdev: WebDev Arena
   - lmarena_vision: Vision Arena
"""

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
ICONS_DIR = ROOT / "assets" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)
ICONS_MANIFEST_PATH = ICONS_DIR / "manifest.json"
OUT_PATH = DATA_DIR / "leaderboard.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

VENDOR_METADATA = {
    "google": {"name": "Google", "nameZh": "谷歌", "country": "US"},
    "openai": {"name": "OpenAI", "nameZh": "OpenAI", "country": "US"},
    "anthropic": {"name": "Anthropic", "nameZh": "Anthropic", "country": "US"},
    "meta": {"name": "Meta", "nameZh": "Meta", "country": "US"},
    "deepseek": {"name": "DeepSeek", "nameZh": "深度求索", "country": "CN"},
    "xai": {"name": "xAI", "nameZh": "xAI (SpaceXAI)", "country": "US"},
    "alibaba": {"name": "Alibaba", "nameZh": "阿里巴巴 / 通义千问", "country": "CN"},
    "bytedance": {"name": "ByteDance", "nameZh": "字节跳动 / 豆包", "country": "CN"},
    "tencent": {"name": "Tencent", "nameZh": "腾讯 / 混元", "country": "CN"},
    "baidu": {"name": "Baidu", "nameZh": "百度 / 文心", "country": "CN"},
    "zai": {"name": "Z.ai (Zhipu)", "nameZh": "智谱 AI", "country": "CN"},
    "moonshot": {"name": "Moonshot AI (Kimi)", "nameZh": "月之暗面 / Kimi", "country": "CN"},
    "minimax": {"name": "MiniMax", "nameZh": "MiniMax", "country": "CN"},
    "stepfun": {"name": "StepFun", "nameZh": "阶跃星辰", "country": "CN"},
    "mistral": {"name": "Mistral AI", "nameZh": "Mistral AI", "country": "FR"},
    "cohere": {"name": "Cohere", "nameZh": "Cohere", "country": "CA"},
    "nvidia": {"name": "NVIDIA", "nameZh": "英伟达", "country": "US"},
    "microsoft": {"name": "Microsoft", "nameZh": "微软", "country": "US"},
    "amazon": {"name": "Amazon AWS", "nameZh": "亚马逊 AWS", "country": "US"},
    "ibm": {"name": "IBM", "nameZh": "IBM", "country": "US"},
    "xiaomi": {"name": "Xiaomi", "nameZh": "小米", "country": "CN"},
    "meituan": {"name": "Meituan (LongCat)", "nameZh": "美团 LongCat", "country": "CN"},
    "ant-group": {"name": "Ant Group", "nameZh": "蚂蚁集团 / InclusionAI", "country": "CN"},
    "allenai": {"name": "AllenAI (Ai2)", "nameZh": "艾伦人工智能研究所", "country": "US"},
    "upstage": {"name": "Upstage", "nameZh": "Upstage", "country": "KR"},
    "perplexity": {"name": "Perplexity", "nameZh": "Perplexity", "country": "US"},
    "reflection": {"name": "Reflection", "nameZh": "Reflection", "country": "US"},
    "inception-ai": {"name": "Inception", "nameZh": "Inception Labs", "country": "US"},
    "arcee-ai": {"name": "Arcee AI", "nameZh": "Arcee AI", "country": "US"},
    "poolside": {"name": "Poolside", "nameZh": "Poolside", "country": "US"},
    "kwaikat": {"name": "KwaiKAT", "nameZh": "快手 KwaiKAT", "country": "CN"},
    "thinky": {"name": "Thinking Machines", "nameZh": "Thinking Machines", "country": "US"},
    "synlan": {"name": "iFlytek Spark", "nameZh": "讯飞星火", "country": "CN"},
    "unisound": {"name": "Unisound", "nameZh": "云知声", "country": "CN"},
    "ai21": {"name": "AI21 Labs", "nameZh": "AI21 Labs", "country": "IL"},
    "lg": {"name": "LG AI Research", "nameZh": "LG AI 研究院", "country": "KR"},
    "liquidai": {"name": "Liquid AI", "nameZh": "Liquid AI", "country": "US"},
    "naver": {"name": "Naver", "nameZh": "Naver", "country": "KR"},
    "openbmb": {"name": "OpenBMB", "nameZh": "面壁智能 / OpenBMB", "country": "CN"},
    "nous": {"name": "Nous Research", "nameZh": "Nous Research", "country": "US"},
    "deepcogito": {"name": "Deep Cogito", "nameZh": "Deep Cogito", "country": "US"},
    "reka": {"name": "Reka AI", "nameZh": "Reka AI", "country": "US"},
    "tii": {"name": "TII UAE", "nameZh": "阿联酋 TII (Falcon)", "country": "AE"},
    "servicenow": {"name": "ServiceNow", "nameZh": "ServiceNow", "country": "US"},
    "sktelecom": {"name": "SK Telecom", "nameZh": "SK Telecom", "country": "KR"},
    "koreatelecom": {"name": "Korea Telecom", "nameZh": "韩国电信 KT", "country": "KR"},
    "chinamobile": {"name": "China Mobile", "nameZh": "中国移动九天", "country": "CN"},
    "sarvam": {"name": "Sarvam AI", "nameZh": "Sarvam AI", "country": "IN"},
    "primeintellect": {"name": "Prime Intellect", "nameZh": "Prime Intellect", "country": "US"},
    "swissai": {"name": "Swiss AI Initiative", "nameZh": "瑞士 AI 倡议", "country": "CH"},
    "nanbeige": {"name": "Nanbeige", "nameZh": "南北阁 Nanbeige", "country": "CN"},
}

ORG_ALIASES = {
    "google": "google",
    "openai": "openai",
    "anthropic": "anthropic",
    "meta": "meta",
    "deepseek": "deepseek",
    "xai": "xai",
    "spacexai": "xai",
    "alibaba": "alibaba",
    "bytedance": "bytedance",
    "bytedance seed": "bytedance",
    "tencent": "tencent",
    "baidu": "baidu",
    "zai": "zai",
    "z ai": "zai",
    "z.ai": "zai",
    "zhipu": "zai",
    "zhipu ai": "zai",
    "moonshot": "moonshot",
    "moonshot ai": "moonshot",
    "kimi": "moonshot",
    "minimax": "minimax",
    "stepfun": "stepfun",
    "mistral": "mistral",
    "mistral ai": "mistral",
    "cohere": "cohere",
    "nvidia": "nvidia",
    "microsoft": "microsoft",
    "microsoft-ai": "microsoft",
    "microsoft ai": "microsoft",
    "amazon": "amazon",
    "ibm": "ibm",
    "xiaomi": "xiaomi",
    "meituan": "meituan",
    "longcat": "meituan",
    "ant-group": "ant-group",
    "inclusionai": "ant-group",
    "allenai": "allenai",
    "allen institute for ai": "allenai",
    "upstage": "upstage",
    "perplexity": "perplexity",
    "reflection": "reflection",
    "inception": "inception-ai",
    "inception-ai": "inception-ai",
    "arcee ai": "arcee-ai",
    "arcee-ai": "arcee-ai",
    "poolside": "poolside",
    "kwaikat": "kwaikat",
    "thinky": "thinky",
    "thinking machines": "thinky",
    "ai21 labs": "ai21",
    "lg ai research": "lg",
    "liquid ai": "liquidai",
    "naver": "naver",
    "openbmb": "openbmb",
    "nous research": "nous",
    "deep cogito": "deepcogito",
    "reka ai": "reka",
    "tii uae": "tii",
    "servicenow": "servicenow",
    "sk telecom": "sktelecom",
    "korea telecom": "koreatelecom",
    "china mobile": "chinamobile",
    "sarvam": "sarvam",
    "prime intellect": "primeintellect",
    "swiss ai initiative": "swissai",
    "nanbeige": "nanbeige",
}

# Monochrome SVGs from AA that need dark-mode inversion if downloaded from AA
MONO_SLUGS = {
    "openai", "anthropic", "xai", "zai", "moonshot", "ibm", "inception-ai",
    "kwaikat", "thinky", "ai21", "liquidai", "primeintellect", "reka",
    "tii", "servicenow", "trillion-labs", "apodex", "celeris", "motif-technologies",
}


def fetch_bytes(url: str, timeout: int = 35) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def safe_round(val, digits=1):
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, digits)
    except (TypeError, ValueError):
        return None


def normalize_org(org: str) -> str:
    if not org:
        return "unknown"
    key = org.strip().lower()
    if key in ORG_ALIASES:
        return ORG_ALIASES[key]
    return re.sub(r"[^a-z0-9]+", "-", key).strip("-")


def is_open_license(lic: str) -> bool:
    if not lic:
        return False
    low = lic.lower().strip()
    return low not in ("proprietary", "unknown", "api", "closed", "commercial")


def ensure_official_logo(vendor_id: str, aa_logo_path: str, icon_manifest: dict):
    """Ensure every vendor has a locally bundled official logo (never hand-drawn)."""
    existing = icon_manifest.get(vendor_id)
    if existing and (ROOT / existing["icon"]).exists():
        return existing

    if not aa_logo_path:
        return None

    url = aa_logo_path if aa_logo_path.startswith("http") else f"https://artificialanalysis.ai{aa_logo_path}"
    ext = Path(aa_logo_path.split("?")[0]).suffix.lower() or ".svg"
    if ext not in (".svg", ".png", ".jpg", ".jpeg", ".webp"):
        ext = ".svg"
    filename = f"{vendor_id}{ext}"
    dest = ICONS_DIR / filename

    if not dest.exists() or dest.stat().st_size < 60:
        try:
            data = fetch_bytes(url, timeout=12)
            if len(data) < 60:
                return None
            dest.write_bytes(data)
            print(f"[Icon] Downloaded official logo {filename} <- {url} ({len(data)} B)")
        except Exception as e:
            print(f"[Icon] Warn: failed {url}: {e}")
            return None

    # Detect if SVG is purely monochrome black/currentColor for dark mode inversion
    is_mono = vendor_id in MONO_SLUGS
    if ext == ".svg" and not is_mono:
        try:
            svg_txt = dest.read_text(encoding="utf-8", errors="ignore").lower()
            has_color = bool(re.search(r"#[0-9a-f]{3,6}", re.sub(r"#(000|000000|111|111111|1f1f1f|222|222222|fff|ffffff)\b", "", svg_txt)))
            is_mono = not has_color and ("currentcolor" in svg_txt or "#000" in svg_txt or "fill=" not in svg_txt)
        except Exception:
            pass

    entry = {"icon": f"assets/icons/{filename}", "mono": is_mono, "source": url}
    icon_manifest[vendor_id] = entry
    return entry


def fetch_artificial_analysis_models():
    """Fetch public Artificial Analysis models dataset from Next.js SSR RSC payload."""
    url = "https://artificialanalysis.ai/leaderboards/models"
    html = fetch_bytes(url, timeout=35).decode("utf-8", errors="replace")
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, flags=re.S)
    joined = "".join(json.loads(f'"{c}"') for c in chunks)
    m = re.search(r'"initialModels":(\[\{"id":)', joined)
    if not m:
        raise RuntimeError("Could not locate initialModels payload on artificialanalysis.ai")
    arr, _ = json.JSONDecoder().raw_decode(joined, m.start(1))
    print(f"[ArtificialAnalysis] Fetched {len(arr)} models from {url}")
    return arr


def build_aa_tracks(aa_raw: list, icon_manifest: dict, today_str: str):
    """Transform Artificial Analysis models into 5 rich multi-dimensional tracks."""
    normalized = []

    for x in aa_raw:
        if x.get("deprecated"):
            continue
        raw_creator = x.get("modelCreatorName") or ""
        vendor = normalize_org(raw_creator)
        # Prefer existing crisp @lobehub icons for known vendors; auto-download AA official logo for new ones
        if vendor not in icon_manifest and x.get("modelCreatorLogo"):
            ensure_official_logo(vendor, x.get("modelCreatorLogo"), icon_manifest)
        if vendor not in VENDOR_METADATA and raw_creator:
            VENDOR_METADATA[vendor] = {"name": raw_creator, "nameZh": raw_creator, "country": ""}

        rel = x.get("release") or {}
        release_slug = rel.get("slug") or re.sub(r"[^a-z0-9]+", "-", (x.get("shortName") or x.get("name") or "").lower()).strip("-")
        release_name = rel.get("name") or x.get("shortName") or x.get("name") or ""
        display_name = x.get("shortName") or x.get("name") or release_name

        raw_scores = x.get("scores") or {}

        def pct(k):
            v = raw_scores.get(k)
            if v is None:
                return None
            f = float(v)
            return safe_round(f * 100.0 if f <= 1.05 else f, 1)

        p_in = safe_round(x.get("price1mInputTokens"), 2)
        p_out = safe_round(x.get("price1mOutputTokens"), 2)
        p_blended = safe_round((3.0 * p_in + p_out) / 4.0, 2) if p_in is not None and p_out is not None else None

        scores = {
            "intelligenceIndex": safe_round(x.get("intelligenceIndex"), 1),
            "omniscience": safe_round(x.get("omniscience"), 1),
            "frontiercode-2-0": pct("frontiercode-2-0"),
            "terminalbench-4-0": pct("terminalbench-4-0"),
            "terminal-bench-science": pct("terminal-bench-science"),
            "hle-diamond": pct("hle-diamond"),
            "critpt-v2-hard": pct("critpt-v2-hard"),
            "aa-briefcase": safe_round(raw_scores.get("aa-briefcase"), 0),
            "automationbench-aa": pct("automationbench-aa"),
            "gdp-pdf": pct("gdp-pdf"),
            "mlcr-aa": pct("mlcr-aa"),
            "omniscience-accuracy": pct("omniscience-accuracy"),
            "omniscience-non-hallucination": pct("omniscience-non-hallucination"),
            "aa-lcr": pct("artificial-analysis-long-context-reasoning"),
            "healthbench": pct("healthbench"),
            "outputSpeed": safe_round(x.get("outputSpeed"), 0),
            "timeToFirstToken": safe_round(x.get("timeToFirstToken"), 2),
            "price1mInputTokens": p_in,
            "price1mOutputTokens": p_out,
            "priceBlended": p_blended,
            "costPerTask": safe_round(x.get("intelligenceIndexCostPerTask"), 2),
        }

        is_open = bool(x.get("isOpenWeights"))
        is_reasoning = bool(x.get("isReasoning"))

        normalized.append({
            "id": x.get("id") or re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-"),
            "name": display_name,
            "fullName": x.get("name") or display_name,
            "releaseSlug": release_slug,
            "releaseName": release_name,
            "vendor": vendor,
            "license": "Open Weights" if is_open else "Proprietary",
            "isOpen": is_open,
            "isReasoning": is_reasoning,
            "contextLength": int(x["contextWindowTokens"]) if x.get("contextWindowTokens") else None,
            "pricing": {"input": p_in, "output": p_out} if p_in is not None and p_out is not None else None,
            "outputSpeed": scores["outputSpeed"],
            "ttft": scores["timeToFirstToken"],
            "costPerTask": scores["costPerTask"],
            "scores": scores,
        })

    def make_track(tid, name, short_name, desc, columns, filter_fn, sort_key, lower_is_better=False, unit="分"):
        items = []
        for m in normalized:
            val = m["scores"].get(sort_key)
            if val is None or not filter_fn(m):
                continue
            row = {
                "id": m["id"],
                "name": m["name"],
                "releaseSlug": m["releaseSlug"],
                "releaseName": m["releaseName"],
                "vendor": m["vendor"],
                "license": m["license"],
                "isOpen": m["isOpen"],
                "isReasoning": m["isReasoning"],
                "rank": 0,
                "score": val,
                "ci": None,
                "votes": None,
                "contextLength": m["contextLength"],
                "pricing": m["pricing"],
                "outputSpeed": m["outputSpeed"],
                "ttft": m["ttft"],
                "costPerTask": m["costPerTask"],
                "scores": {c["key"]: m["scores"].get(c["key"]) for c in columns},
            }
            items.append(row)

        items.sort(key=lambda r: (r["score"] if lower_is_better else -r["score"], -(r["scores"].get("intelligenceIndex") or 0)))
        for idx, r in enumerate(items, 1):
            r["rank"] = idx

        print(f"[AA:{tid}] Built {len(items)} models (top={items[0]['name'] if items else 'none'})")
        return {
            "id": tid,
            "name": name,
            "shortName": short_name,
            "source": "artificial_analysis",
            "publishDate": today_str,
            "scoreLabel": columns[0]["label"],
            "scoreUnit": unit,
            "supportsReleaseDedup": True,
            "description": desc,
            "columns": columns,
            "models": items,
        }

    tracks = {}

    tracks["aa_intelligence"] = make_track(
        "aa_intelligence",
        "综合智力总榜 (AA Intelligence Index v5)",
        "综合智力总榜",
        "Artificial Analysis Intelligence Index v5.0.1 权威独立基准，涵盖 Claude Fable 5.2、GPT-6.2 Astra/Sol、Gemini 4 等最新旗舰，同表呈现编程、终端 Agent、人类终极考、科研推理、办公实战、速度与价格。",
        [
            {"key": "intelligenceIndex", "label": "智力指数", "primary": True, "format": "index"},
            {"key": "frontiercode-2-0", "label": "前沿编程", "format": "pct"},
            {"key": "terminalbench-4-0", "label": "终端 Agent", "format": "pct"},
            {"key": "hle-diamond", "label": "人类终极考", "format": "pct"},
            {"key": "critpt-v2-hard", "label": "科研推理", "format": "pct"},
            {"key": "aa-briefcase", "label": "办公实战", "format": "elo"},
            {"key": "automationbench-aa", "label": "自主自动化", "format": "pct"},
            {"key": "outputSpeed", "label": "速度 tok/s", "format": "speed"},
            {"key": "priceBlended", "label": "综合价 $/1M", "format": "usd", "lowerIsBetter": True},
        ],
        filter_fn=lambda m: True,
        sort_key="intelligenceIndex",
        unit="分",
    )

    tracks["aa_coding"] = make_track(
        "aa_coding",
        "前沿编程与 Agent 工程榜",
        "编程与 Agent",
        "聚焦 FrontierCode 2.0、Terminal-Bench 4.0、科学终端（TB-Science）、AutomationBench 与多轮长上下文代码推理（MLCR-AA），全面衡量真实软件工程与自主 Agent 能力。",
        [
            {"key": "frontiercode-2-0", "label": "前沿编程 2.0", "primary": True, "format": "pct"},
            {"key": "terminalbench-4-0", "label": "终端工程 4.0", "format": "pct"},
            {"key": "terminal-bench-science", "label": "科学终端", "format": "pct"},
            {"key": "automationbench-aa", "label": "自主自动化", "format": "pct"},
            {"key": "mlcr-aa", "label": "长程代码推理", "format": "pct"},
            {"key": "intelligenceIndex", "label": "智力指数", "format": "index"},
            {"key": "priceBlended", "label": "综合价 $/1M", "format": "usd", "lowerIsBetter": True},
        ],
        filter_fn=lambda m: True,
        sort_key="frontiercode-2-0",
        unit="%",
    )

    tracks["aa_reasoning"] = make_track(
        "aa_reasoning",
        "深度推理与科研办公榜",
        "推理与科研",
        "聚焦 Humanity's Last Exam (HLE Diamond)、前沿科研推理（CritPt v2 Hard）、科学计算、真实经济工作（AA-Briefcase）与复杂 PDF 文档处理（GDP-PDF）。",
        [
            {"key": "hle-diamond", "label": "人类终极考", "primary": True, "format": "pct"},
            {"key": "critpt-v2-hard", "label": "前沿科研推理", "format": "pct"},
            {"key": "terminal-bench-science", "label": "科学计算", "format": "pct"},
            {"key": "aa-briefcase", "label": "办公实战 Elo", "format": "elo"},
            {"key": "gdp-pdf", "label": "复杂文档解析", "format": "pct"},
            {"key": "intelligenceIndex", "label": "智力指数", "format": "index"},
        ],
        filter_fn=lambda m: True,
        sort_key="hle-diamond",
        unit="%",
    )

    tracks["aa_knowledge"] = make_track(
        "aa_knowledge",
        "知识广度与抗幻觉榜 (Omniscience)",
        "知识与抗幻觉",
        "Artificial Analysis Omniscience 专项评测，严格惩罚瞎编胡说，从全知指数、知识准确率、抗幻觉率、长文本推理（AA-LCR）与专业医疗问答多维度评估可靠性。",
        [
            {"key": "omniscience", "label": "全知指数", "primary": True, "format": "index"},
            {"key": "omniscience-accuracy", "label": "知识准确率", "format": "pct"},
            {"key": "omniscience-non-hallucination", "label": "抗幻觉率", "format": "pct"},
            {"key": "aa-lcr", "label": "长文本推理", "format": "pct"},
            {"key": "healthbench", "label": "专业医疗", "format": "pct"},
            {"key": "intelligenceIndex", "label": "智力指数", "format": "index"},
        ],
        filter_fn=lambda m: True,
        sort_key="omniscience",
        unit="分",
    )

    tracks["aa_efficiency"] = make_track(
        "aa_efficiency",
        "推理速度与 API 性价比榜",
        "速度与价格",
        "Artificial Analysis 实测线上 API 吞吐速度（Tokens/s）、首字延迟（TTFT）、每百万 Token 输入/输出定价及单任务平均成本，助你权衡性能与成本。",
        [
            {"key": "outputSpeed", "label": "输出速度 tok/s", "primary": True, "format": "speed"},
            {"key": "timeToFirstToken", "label": "首字延迟", "format": "sec", "lowerIsBetter": True},
            {"key": "priceBlended", "label": "综合价 $/1M", "format": "usd", "lowerIsBetter": True},
            {"key": "price1mInputTokens", "label": "输入价 $/1M", "format": "usd", "lowerIsBetter": True},
            {"key": "price1mOutputTokens", "label": "输出价 $/1M", "format": "usd", "lowerIsBetter": True},
            {"key": "costPerTask", "label": "单任务成本", "format": "usdTask", "lowerIsBetter": True},
            {"key": "intelligenceIndex", "label": "智力指数", "format": "index"},
        ],
        filter_fn=lambda m: (m["scores"].get("outputSpeed") or 0) > 0 and m["scores"].get("intelligenceIndex") is not None,
        sort_key="outputSpeed",
        unit="tok/s",
    )

    return tracks


def fetch_lmarena_config(config_name: str):
    url = (
        "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/"
        f"resolve/refs%2Fconvert%2Fparquet/{config_name}/latest/0000.parquet"
    )
    raw = fetch_bytes(url, timeout=40)
    table = pq.read_table(io.BytesIO(raw), use_threads=False)
    return table.to_pylist()


def build_lmarena_elo_track(track_id, config_name, name, short_name, desc, columns_spec, max_models=160):
    rows = fetch_lmarena_config(config_name)
    dates = sorted({str(r.get("leaderboard_publish_date")) for r in rows if r.get("leaderboard_publish_date")})
    pub_date = dates[-1] if dates else ""

    wanted = [c["key"] for c in columns_spec]
    primary = wanted[0]
    by_model = {}
    scores_by_model = defaultdict(dict)

    for r in rows:
        cat = r.get("category")
        if cat not in wanted:
            continue
        mname = r.get("model_name")
        rating = safe_round(r.get("rating"), 1)
        if not mname or rating is None:
            continue
        scores_by_model[mname][cat] = rating
        if cat == primary:
            hi, lo = r.get("rating_upper"), r.get("rating_lower")
            ci = safe_round((float(hi) - float(lo)) / 2.0, 1) if hi is not None and lo is not None else None
            votes = r.get("vote_count")
            by_model[mname] = {
                "id": re.sub(r"[^a-z0-9]+", "-", mname.lower()).strip("-"),
                "name": mname,
                "vendor": normalize_org(r.get("organization")),
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
        models.append(item)

    models.sort(key=lambda x: (-x["score"], x["rank"] if x["rank"] is not None else 9999))
    models = models[:max_models]
    for idx, m in enumerate(models, 1):
        m["rank"] = idx

    print(f"[LMArena:{config_name}] Built {len(models)} models (date={pub_date})")
    return {
        "id": track_id,
        "name": name,
        "shortName": short_name,
        "source": "lmarena",
        "publishDate": pub_date,
        "scoreLabel": columns_spec[0]["label"],
        "scoreUnit": "Elo",
        "supportsReleaseDedup": False,
        "description": desc,
        "columns": columns_spec,
        "models": models,
    }


def build_lmarena_agent_track():
    base_rows = fetch_lmarena_config("agent")
    dates = sorted({str(r.get("leaderboard_publish_date")) for r in base_rows if r.get("leaderboard_publish_date")})
    pub_date = dates[-1] if dates else ""

    sub_configs = [
        ("capability", "agent_capability", "index_score", 1.0, "能力指数", "elo"),
        ("task_outcome", "agent_task_outcome", "index_score", 1.0, "任务完成", "elo"),
        ("tool_efficiency", "agent_tool_efficiency", "index_score", 1.0, "工具效率", "elo"),
        ("bash_reliability", "agent_bash_reliability", "score", 100.0, "终端可靠", "index"),
        ("steerability", "agent_steerability", "score", 100.0, "可控性", "index"),
    ]
    sub_maps = {}
    for key, cfg_name, field, scale, _label, _fmt in sub_configs:
        m = {}
        try:
            for r in fetch_lmarena_config(cfg_name):
                mn, val = r.get("model_name"), r.get(field)
                if mn and val is not None:
                    v = safe_round(float(val) * scale, 1)
                    if v is not None:
                        m[mn] = v
        except Exception as e:
            print(f"[LMArena:{cfg_name}] Warn: {e}")
        sub_maps[key] = m

    models = []
    for r in base_rows:
        mname, raw_score = r.get("model_name"), r.get("score")
        if not mname or raw_score is None:
            continue
        overall = safe_round(float(raw_score) * 100.0, 1)
        if overall is None:
            continue
        lo, hi = r.get("score_ci_lower"), r.get("score_ci_upper")
        ci = safe_round((float(hi) - float(lo)) * 50.0, 1) if lo is not None and hi is not None else None
        sessions = r.get("session_count")
        scores = {"overall": overall}
        for key, _cfg, _f, _s, _lbl, _fmt in sub_configs:
            if mname in sub_maps[key]:
                scores[key] = sub_maps[key][mname]

        models.append({
            "id": re.sub(r"[^a-z0-9]+", "-", mname.lower()).strip("-"),
            "name": mname,
            "vendor": normalize_org(r.get("organization")),
            "license": r.get("license") or "Unknown",
            "isOpen": is_open_license(r.get("license")),
            "rank": int(r["rank"]) if r.get("rank") is not None else None,
            "score": overall,
            "ci": ci,
            "votes": int(round(float(sessions))) if sessions is not None and not math.isnan(float(sessions)) else None,
            "scores": scores,
        })

    models.sort(key=lambda x: (-x["score"], x["rank"] if x["rank"] is not None else 9999))
    for idx, m in enumerate(models, 1):
        m["rank"] = idx

    columns = [{"key": "overall", "label": "Agent 综合", "primary": True, "format": "index"}] + [
        {"key": key, "label": label, "format": fmt} for key, _c, _f, _s, label, fmt in sub_configs
    ]
    print(f"[LMArena:agent] Built {len(models)} models (date={pub_date})")
    return {
        "id": "lmarena_agent",
        "name": "LMArena Agent 盲测实战榜",
        "shortName": "Arena Agent",
        "source": "lmarena",
        "publishDate": pub_date,
        "scoreLabel": "Agent 综合",
        "scoreUnit": "分",
        "supportsReleaseDedup": False,
        "description": "LMArena Agent Arena 真实环境人类盲测排行（收录 Claude Fable 5.2、GPT-6 Astra、Gemini 4 等），衡量真实自主任务完成度与工具使用效率。",
        "columns": columns,
        "models": models,
    }


def main():
    icon_manifest = {}
    if ICONS_MANIFEST_PATH.exists():
        icon_manifest = json.loads(ICONS_MANIFEST_PATH.read_text(encoding="utf-8"))

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tracks = {}

    # 1. Primary Source: Artificial Analysis
    try:
        aa_raw = fetch_artificial_analysis_models()
        aa_tracks = build_aa_tracks(aa_raw, icon_manifest, today_str)
        tracks.update(aa_tracks)
    except Exception as e:
        print(f"[ERROR] Artificial Analysis fetch failed: {e}", file=sys.stderr)

    # Save updated icon manifest if new official logos were downloaded
    ICONS_MANIFEST_PATH.write_text(json.dumps(icon_manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    # 2. Complementary Source: LMArena Human Blind-Test Leaderboards
    lmarena_specs = [
        (
            "lmarena_text",
            "text",
            "LMArena 人类盲测文本榜",
            "Arena 文本盲测",
            "LMArena (Chatbot Arena) 匿名盲测人类偏好 Elo 排行，作为客观基准的重要补充，直观对比真实人类对回答质量、编程、数学与中文表达的偏好。",
            [
                {"key": "overall", "label": "综合 Elo", "primary": True, "format": "elo"},
                {"key": "hard_prompts", "label": "复杂难题", "format": "elo"},
                {"key": "coding", "label": "编程能力", "format": "elo"},
                {"key": "math", "label": "数学推理", "format": "elo"},
                {"key": "chinese", "label": "中文能力", "format": "elo"},
                {"key": "creative_writing", "label": "创意写作", "format": "elo"},
                {"key": "instruction_following", "label": "指令遵循", "format": "elo"},
            ],
            160,
        ),
        (
            "lmarena_webdev",
            "webdev",
            "LMArena Web 开发与前端榜",
            "Arena Web开发",
            "LMArena WebDev Arena 盲测排行，真实检验模型编写交互式网页、React / HTML 应用及识图建站的前端工程能力。",
            [
                {"key": "overall", "label": "WebDev Elo", "primary": True, "format": "elo"},
                {"key": "webdev-react", "label": "React 应用", "format": "elo"},
                {"key": "webdev-html", "label": "HTML/CSS", "format": "elo"},
                {"key": "image_to_webdev", "label": "识图建站", "format": "elo"},
            ],
            120,
        ),
        (
            "lmarena_vision",
            "vision",
            "LMArena 多模态视觉榜",
            "Arena 多模态",
            "LMArena Vision Arena 盲测排行，评估大模型在图像理解、OCR 文字识别、图表解析与中文视觉问答上的综合实力。",
            [
                {"key": "overall", "label": "视觉 Elo", "primary": True, "format": "elo"},
                {"key": "ocr", "label": "OCR 识别", "format": "elo"},
                {"key": "diagram", "label": "图表解析", "format": "elo"},
                {"key": "chinese", "label": "中文视觉", "format": "elo"},
                {"key": "homework", "label": "学科解题", "format": "elo"},
            ],
            120,
        ),
    ]

    lmarena_dates = {}
    for spec in lmarena_specs:
        try:
            t = build_lmarena_elo_track(*spec)
            tracks[t["id"]] = t
            lmarena_dates[t["id"]] = t["publishDate"]
        except Exception as e:
            print(f"[WARN] LMArena {spec[0]} failed: {e}", file=sys.stderr)

    try:
        ag = build_lmarena_agent_track()
        tracks["lmarena_agent"] = ag
        lmarena_dates["lmarena_agent"] = ag["publishDate"]
    except Exception as e:
        print(f"[WARN] LMArena agent failed: {e}", file=sys.stderr)

    # Assemble vendor registry
    seen_vendors = {m["vendor"] for t in tracks.values() for m in t["models"]}
    vendors = {}
    for v in sorted(seen_vendors):
        meta = VENDOR_METADATA.get(v, {"name": v.replace("-", " ").title(), "nameZh": v.replace("-", " ").title(), "country": ""})
        ic = icon_manifest.get(v) or {}
        vendors[v] = {
            "id": v,
            "name": meta["name"],
            "nameZh": meta["nameZh"],
            "country": meta.get("country", ""),
            "icon": ic.get("icon", ""),
            "mono": bool(ic.get("mono", False)),
            "iconSource": ic.get("source", ""),
        }

    track_order = [
        "aa_intelligence",
        "aa_coding",
        "aa_reasoning",
        "aa_knowledge",
        "aa_efficiency",
        "lmarena_agent",
        "lmarena_text",
        "lmarena_webdev",
        "lmarena_vision",
    ]

    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scheduleCron": "0 */6 * * *",
            "scheduleIntervalHours": 6,
            "scheduleLabel": "每 6 小时由 GitHub Actions 定时自动抓取更新",
            "trackOrder": [t for t in track_order if t in tracks],
            "sources": [
                {
                    "id": "artificial_analysis",
                    "name": "Artificial Analysis",
                    "url": "https://artificialanalysis.ai/leaderboards/models",
                    "datasetUrl": "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
                    "description": "全球最受认可的独立 AI 模型综合评测机构。涵盖 Intelligence Index v5（含 FrontierCode 2.0、Terminal-Bench 4.0、HLE Diamond、CritPt v2、AA-Briefcase、AutomationBench、Omniscience 抗幻觉），并实测各模型吞吐速度（tok/s）、首字延迟与 API 定价，第一时间收录 Claude Fable 5.2、GPT-6.2 Astra/Sol、Gemini 4 等最新模型。",
                    "publishDate": today_str,
                },
                {
                    "id": "lmarena",
                    "name": "LMArena (Chatbot Arena)",
                    "url": "https://lmarena.ai/leaderboard",
                    "datasetUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
                    "description": "全球权威匿名盲测人类偏好 Elo 排行榜（UC Berkeley LMSYS），作为客观评测的互补视角，提供文本、Agent、Web 开发与多模态视觉盲测排名。",
                    "publishDates": lmarena_dates,
                },
            ],
        },
        "vendors": vendors,
        "tracks": tracks,
    }

    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    missing_icons = [vid for vid, v in vendors.items() if not v.get("icon")]
    print(f"\n[DONE] Wrote {OUT_PATH} ({size_kb:.1f} KB), {len(tracks)} tracks, {len(vendors)} vendors, missing_icons={missing_icons}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
    os._exit(0)
