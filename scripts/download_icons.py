#!/usr/bin/env python3
"""
Download official AI vendor icons from @lobehub/icons-static-svg, Simple Icons,
and official vendor domains. Zero hand-drawn icons.
"""

import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "assets" / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

LOBE_BASE = "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons"

# Mapping: normalized org key -> (local filename, download URL, is_monochrome)
VENDOR_ICONS = {
    "google": ("google.svg", f"{LOBE_BASE}/google-color.svg", False),
    "openai": ("openai.svg", f"{LOBE_BASE}/openai.svg", True),
    "anthropic": ("anthropic.svg", f"{LOBE_BASE}/anthropic.svg", True),
    "meta": ("meta.svg", f"{LOBE_BASE}/meta-color.svg", False),
    "deepseek": ("deepseek.svg", f"{LOBE_BASE}/deepseek-color.svg", False),
    "xai": ("xai.svg", f"{LOBE_BASE}/xai.svg", True),
    "alibaba": ("alibaba.svg", f"{LOBE_BASE}/alibaba-color.svg", False),
    "bytedance": ("bytedance.svg", f"{LOBE_BASE}/bytedance-color.svg", False),
    "tencent": ("tencent.svg", f"{LOBE_BASE}/tencent-color.svg", False),
    "baidu": ("baidu.svg", f"{LOBE_BASE}/baidu-color.svg", False),
    "zai": ("zai.svg", f"{LOBE_BASE}/zai.svg", True),
    "zhipu": ("zhipu.svg", f"{LOBE_BASE}/zhipu-color.svg", False),
    "moonshot": ("moonshot.svg", f"{LOBE_BASE}/moonshot.svg", True),
    "minimax": ("minimax.svg", f"{LOBE_BASE}/minimax-color.svg", False),
    "stepfun": ("stepfun.svg", f"{LOBE_BASE}/stepfun-color.svg", False),
    "mistral": ("mistral.svg", f"{LOBE_BASE}/mistral-color.svg", False),
    "cohere": ("cohere.svg", f"{LOBE_BASE}/cohere-color.svg", False),
    "nvidia": ("nvidia.svg", f"{LOBE_BASE}/nvidia-color.svg", False),
    "microsoft": ("microsoft.svg", f"{LOBE_BASE}/microsoft-color.svg", False),
    "microsoft-ai": ("microsoft.svg", f"{LOBE_BASE}/microsoft-color.svg", False),
    "amazon": ("aws.svg", f"{LOBE_BASE}/aws-color.svg", False),
    "ibm": ("ibm.svg", f"{LOBE_BASE}/ibm.svg", True),
    "xiaomi": ("xiaomi.svg", "https://cdn.simpleicons.org/xiaomi/FF6900", False),
    "meituan": ("meituan.svg", f"{LOBE_BASE}/longcat-color.svg", False),
    "ant-group": ("antgroup.svg", f"{LOBE_BASE}/antgroup-color.svg", False),
    "allenai": ("allenai.svg", f"{LOBE_BASE}/ai2-color.svg", False),
    "upstage": ("upstage.svg", f"{LOBE_BASE}/upstage-color.svg", False),
    "perplexity": ("perplexity.svg", f"{LOBE_BASE}/perplexity-color.svg", False),
    "reflection": ("reflection.svg", f"{LOBE_BASE}/reflection-color.svg", False),
    "inception-ai": ("inception.svg", f"{LOBE_BASE}/inception.svg", True),
    "arcee-ai": ("arcee.svg", f"{LOBE_BASE}/arcee-color.svg", False),
    "poolside": ("poolside.svg", f"{LOBE_BASE}/poolside-color.svg", False),
    "kling": ("kling.svg", f"{LOBE_BASE}/kling-color.svg", False),
    "kwaikat": ("kwaikat.svg", f"{LOBE_BASE}/kwaikat.svg", True),
    "bfl": ("bfl.svg", f"{LOBE_BASE}/bfl.svg", True),
    "stability ai": ("stability.svg", f"{LOBE_BASE}/stability-color.svg", False),
    "ideogram": ("ideogram.svg", f"{LOBE_BASE}/ideogram.svg", True),
    "recraft": ("recraft.svg", f"{LOBE_BASE}/recraft.svg", True),
    "runway": ("runway.svg", f"{LOBE_BASE}/runway.svg", True),
    "luma-ai": ("luma.svg", f"{LOBE_BASE}/luma-color.svg", False),
    "pika": ("pika.svg", f"{LOBE_BASE}/pika.svg", True),
    "krea": ("krea.svg", f"{LOBE_BASE}/krea.svg", True),
    "reve": ("reve.svg", f"{LOBE_BASE}/reve.svg", True),
    "skyreel": ("skywork.svg", f"{LOBE_BASE}/skywork-color.svg", False),
    "synlan": ("spark.svg", f"{LOBE_BASE}/spark-color.svg", False),
    "pixverse": ("pixverse.svg", f"{LOBE_BASE}/pixverse-color.svg", False),
    "lightricks": ("lightricks.svg", f"{LOBE_BASE}/lightricks.svg", True),
    "pruna": ("pruna.svg", f"{LOBE_BASE}/prunaai-color.svg", False),
    # Official domain favicons for emerging/niche labs not yet in LobeHub Icons
    "thinky": ("thinky.png", "https://www.google.com/s2/favicons?domain=thinkingmachines.ai&sz=128", False),
    "diffbot": ("diffbot.png", "https://www.google.com/s2/favicons?domain=diffbot.com&sz=128", False),
    "genmo": ("genmo.png", "https://www.google.com/s2/favicons?domain=genmo.ai&sz=128", False),
    "hidream": ("hidream.png", "https://www.google.com/s2/favicons?domain=hidreamai.com&sz=128", False),
    "kandinsky": ("kandinsky.png", "https://www.google.com/s2/favicons?domain=sberbank.com&sz=128", False),
    "leonardo-ai": ("leonardo.png", "https://www.google.com/s2/favicons?domain=leonardo.ai&sz=128", False),
    "unisound": ("unisound.png", "https://www.google.com/s2/favicons?domain=unisound.com&sz=128", False),
}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ModelRankBot/1.0)"}


def download_all():
    downloaded = set()
    manifest = {}
    for org, (filename, url, mono) in VENDOR_ICONS.items():
        dest = ICONS_DIR / filename
        if filename not in downloaded:
            if dest.exists() and dest.stat().st_size >= 60:
                downloaded.add(filename)
            else:
                try:
                    req = urllib.request.Request(url, headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=8) as resp:
                        data = resp.read()
                    if len(data) < 60:
                        raise ValueError(f"Suspiciously small icon ({len(data)} bytes)")
                    dest.write_bytes(data)
                    downloaded.add(filename)
                    print(f"[OK] {filename:20s} <- {url} ({len(data)} B)", flush=True)
                except Exception as e:
                    print(f"[WARN] Failed {filename} ({url}): {e}", flush=True)
                    continue
        manifest[org] = {
            "icon": f"assets/icons/{filename}",
            "mono": mono,
            "source": url,
        }

    manifest_path = ICONS_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved {len(downloaded)} official vendor icons & manifest -> {manifest_path}")


if __name__ == "__main__":
    download_all()
