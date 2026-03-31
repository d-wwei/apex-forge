#!/usr/bin/env python3
"""Evaluate generated code against design structure.

Reads generated code from benchmark/output/ and scores structural fidelity
against the design rubric in benchmark/design-structure.json.

Supports multiple screens. Final score = average across all screens.
Output: prints "structural_score: XX" (0-100) to stdout.
"""

import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
DESIGN_FILE = os.path.join(SCRIPT_DIR, "design-structure.json")


def load_file(path):
    if not os.path.isfile(path):
        return ""
    with open(path, "r", errors="replace") as f:
        return f.read()


def load_design():
    with open(DESIGN_FILE, "r") as f:
        return json.load(f)


def check_pattern(code, patterns, case_insensitive=True):
    """Check if any of the patterns match in the code."""
    flags = re.IGNORECASE if case_insensitive else 0
    for p in patterns:
        if re.search(p, code, flags):
            return True
    return False


def check_all(code, *keywords):
    """Check if ALL keywords/patterns exist somewhere in the code (not necessarily on same line)."""
    for kw in keywords:
        if not re.search(kw, code, re.IGNORECASE):
            return False
    return True


# ============================================================
# Pattern definitions per check ID
# ============================================================

PATTERNS = {
    # ---- Welcome Screen: Structural ----
    "WS01": [r"(topbar|top-bar|header|navbar|nav-bar|app-bar)", r"(agent.*select|select.*agent|dropdown.*agent)", r"(settings|gear|cog).*icon"],
    "WS02": [r"(flex.*center|items-center|justify-center|align-items:\s*center)", r"(main|content|empty|welcome|onboard)"],
    "WS03": [r"(logo|brand|globe).*?(rounded|border-radius|cornerRadius)", r"(rounded-xl|rounded-2xl|rounded-lg).*?(border|shadow)", r"(icon|logo).*?(container|frame|wrapper|box)"],
    "WS04": [r"ACP\s*Browser\s*Client"],
    "WS05": [r"Connect\s*(AI\s*)?agents?\s*to\s*(your\s*)?browser"],
    "WS06": None,  # special
    "WS07": [r"npx\s*@anthropic", r"(code|pre|mono|command).*?(npx|proxy)", r"acp-browser-proxy"],
    "WS08": [r"(documentation|docs|help)", r"Need\s*help"],
    "WS09": [r"(input|message|chat).*?(bar|area|field|box)", r"(type.*message|placeholder|waiting.*connection)"],
    "WS10": [r"(attach|paperclip|clip|upload).*?(btn|button|icon)", r"(send|submit|arrow).*?(btn|button|icon)"],

    # ---- Welcome Screen: Layout ----
    "WL01": [r"flex.*col", r"flex-direction:\s*column", r"flex-col"],
    "WL02": [r"(justify-between|justify-content:\s*space-between|space_between)"],
    "WL03": [r"(flex-1|flex-grow|grow).*?(items-center|align-items.*center)", r"(items-center|justify-center).*?(flex-1|grow)", r"(center|middle).*?(content|main)"],
    "WL04": [r"(gap|space-y|margin-bottom|mb-).*?(4|5|6|8|16|20|24)", r"gap:\s*\d+"],
    "WL05": [r"(step|item).*?(flex.*row|horizontal|flex-row|inline-flex)", r"(flex.*row|flex-row).*?(step|number|badge)", r"(flex|row|horizontal).*?(circle|badge|number)"],
    "WL06": [r"(sticky.*bottom|fixed.*bottom|mt-auto|margin-top:\s*auto)", r"(bottom|footer|input.*bar)"],

    # ---- Welcome Screen: Visual ----
    "WV01": [r"(#0f1117|#0F1117|#111|#0d0f14|rgb\(15)", r"(bg-gray-950|bg-slate-950|bg-zinc-950|dark.*background)", r"(background.*dark|dark.*theme|bg-primary|bg-dark)"],
    "WV02": [r"(#1e2538|#1E2538|#1a1f2e|#1c2333)", r"(bg-gray-800|bg-slate-800|bg-card)", r"(card.*background|surface|elevated)"],
    "WV03": [r"(#6ee7b7|#6EE7B7|#5ddba8|emerald|green-300|teal)", r"(accent|primary.*green|green.*accent|text-emerald)"],
    "WV04": [r"(border|outline|ring).*?(card|container|box|frame)", r"border.*?(white|gray|slate|zinc|opacity|\/)"],
    "WV05": [r"(shadow|box-shadow|drop-shadow)"],
    "WV06": [r"(status|dot|indicator|connected|online).*?(circle|dot|badge|green)", r"(w-2|w-3|h-2|h-3|size-2|size-3).*?(rounded-full|circle)"],
    "WV07": [r"(step.*number|badge|circle).*?(bg|background).*?(green|accent|emerald|#6ee7b7)", r"(rounded-full|border-radius.*50).*?(step|number|badge)", r"(w-6|w-7|w-8|h-6|h-7|h-8|size-6|size-7|size-8).*?(rounded-full|circle)"],

    # ---- Welcome Screen: Typography ----
    "WT01": [r"(DM.Sans|dm.sans|font-family.*sans)", r"(font-sans|Inter|system-ui)"],
    "WT02": [r"(text-xl|text-2xl|text-lg|font-size:\s*(18|20|22|24)px)", r"(font-bold|font-semibold|fontWeight.*?(600|700|bold))"],
    "WT03": [r"(text-gray-400|text-gray-500|text-slate-400|text-muted|#6b7280|#9ca3af)", r"(text-secondary|muted|subdued|opacity)"],
    "WT04": [r"(font-mono|monospace|Courier|Menlo|Consolas|code|pre)"],

    # ---- Chat Screen: Structural ----
    "CS01": [r"Claude\s*Agent", r"(topbar|top-bar|header|navbar)"],
    "CS02": [r"(chat.*area|message.*list|conversation|chat.*container|scroll)", r"(overflow.*auto|overflow.*scroll|flex-1).*?(chat|message)"],
    "CS03": [r"What.*on\s*my\s*current\s*page"],
    "CS04": [r"(GitHub|github)\s*(repository|repo)", r"Here.*what\s*I\s*found"],
    "CS05": [r"(Repository|Branch|Stars).*?(anthropic|main|2\.4k)", r"(code|pre|mono).*?(Repository|Branch|Stars)"],
    "CS06": [r"Summarize\s*the\s*README\s*for\s*me"],
    "CS07": [r"(typing|loading|thinking).*?(indicator|dots|animation|bubble)", r"(dot|circle|ellipse).*?(animate|pulse|bounce|opacity)"],
    "CS08": [r"Type\s*a\s*message"],
    "CS09": [r"(timestamp|time|10:2[0-9]|AM|PM)", r"\d{1,2}:\d{2}"],
    "CS10": [r"(attach|paperclip|clip).*?(btn|button|icon)", r"(send|submit).*?(btn|button|icon)"],

    # ---- Chat Screen: Layout ----
    "CL01": [r"flex.*col", r"flex-direction:\s*column", r"flex-col"],
    "CL02": [r"flex-1", r"flex-grow", r"grow"],  # in chat file, flex-1 is for chat area
    "CL03": [r"justify-end"],  # in chat file, justify-end = user messages aligned right
    "CL04": [r"justify-start"],  # in chat file, justify-start = agent messages aligned left
    "CL05": [r"(gap|space-y).*?(3|4|5|6|12|16|20)", r"gap:\s*\d+"],
    "CL06": [r"(sticky.*bottom|fixed.*bottom|mt-auto|margin-top:\s*auto)", r"(bottom|footer|input.*bar)"],

    # ---- Chat Screen: Visual ----
    "CV01": [r"(#0d3b3c|#0D3B3C|#0d3c3c)", r"bg-\[#0d3b3c\]", r"(bg-teal|bg-emerald).*?(900|950|dark)"],
    "CV02": [r"#1e2538|#1E2538|bg-card"],  # agent bubble background
    "CV03": [r"(rounded-xl|rounded-2xl|rounded-lg|rounded-\[12|border-radius)"],
    "CV04": [r"border.*?(white|rgba|#fff|card)", r"border-white"],  # border on bubbles
    "CV05": [r"(#1a1d26|#1A1D26|bg-\[#1a)", r"bg-input"],
    "CV06": [r"(three|3).*?dot", r"(dot|circle|ellipse).*?(dot|circle|ellipse).*?(dot|circle|ellipse)", r"\.\s*\.\s*\.", r"(opacity|animate).*?(0\.[35]|pulse|bounce)"],
    "CV07": [r"(status|dot|indicator|connected|online).*?(green|#6ee7b7|accent)", r"(w-2|h-2|size-2).*?rounded-full"],

    # ---- Chat Screen: Typography ----
    "CT01": [r"(DM.Sans|dm.sans|font-family.*sans)", r"(font-sans|Inter|system-ui)"],
    "CT02": [r"(text-\[13px\]|font-size:\s*13px|text-sm|text-xs)", r"fontSize.*?13"],
    "CT03": [r"(text-\[10px\]|text-\[11px\]|text-xs|text-\[0\.6|text-muted|#6b7280|#9ca3af).*?(time|stamp|AM|PM|\d:\d)", r"(time|stamp|AM|PM|\d:\d).*?(text-xs|text-muted|#6b7280|text-\[10|text-\[11)"],
    "CT04": [r"(font-mono|monospace|Courier|Menlo|Consolas|code|pre)"],

    # ---- Settings Screen: Structural ----
    "SS01": [r"Settings", r"(close|x|dismiss).*?(btn|button|icon)"],
    "SS02": None,  # special
    "SS03": [r"(active|selected|current).*?(tab|general)", r"(General).*?(accent|#6ee7b7|active|selected|border-b|underline)"],
    "SS04": None,  # special
    "SS05": [r"(System|system).*?(active|selected|accent|#6ee7b7|bg-\[)", r"(active|selected).*?System"],
    "SS06": [r"(Agent\s*Browser\s*Context|browser.*context)", r"(toggle|switch)"],
    "SS07": [r"Auto\s*snapshot\s*browser\s*state"],
    "SS08": [r"v0\.1\.0"],
    "SS09": [r"Agent\s*Communication\s*Protocol"],
    "SS10": None,  # special: compound check

    # ---- Settings Screen: Layout ----
    "SL01": [r"flex.*col", r"flex-direction:\s*column", r"flex-col"],
    "SL02": [r"justify-between"],  # in settings file, justify-between is for header
    "SL03": [r"(flex.*gap|gap).*?(tab|General|Agents)", r"tabs.*map", r"\.map\(.*tab"],  # tab iteration = horizontal layout
    "SL04": [r"(overflow.*auto|overflow.*scroll|flex-1)"],  # in settings, flex-1 or overflow = content area
    "SL05": [r"(gap|space-y).*?(3|4|5|6|12|16|20)", r"gap:\s*\d+"],
    "SL06": [r"flex.*gap.*?(Dark|Light|System|theme)", r"(Dark|Light|System).*?(flex|gap)", r"flex-1.*?(rounded|btn|button)"],  # theme buttons in a row

    # ---- Settings Screen: Visual ----
    "SV01": [r"(#0f1117|#0F1117|#111|bg-gray-950|bg-slate-950)", r"(background.*dark|dark.*theme|bg-primary)"],
    "SV02": [r"rounded-xl.*?border", r"border.*?rounded-xl", r"rounded-xl"],  # cards with rounded corners
    "SV03": [r"(border.*?shadow|shadow.*?border)", r"(shadow-lg|shadow-md)"],  # cards have shadow
    "SV04": [r"border-b-2.*?#6ee7b7", r"border-\[#6ee7b7\]", r"border-b.*?accent"],  # active tab border
    "SV05": [r"text-\[#6ee7b7\]", r"text-emerald", r"#6ee7b7"],  # accent text for active tab (exists in file)
    "SV06": [r"(#6ee7b7|accent|emerald).*?(toggle|switch|knob|track)", r"(toggle|switch|knob|track).*?(#6ee7b7|accent)", r"bg-\[#6ee7b7"],  # toggle green
    "SV07": [r"border-b.*?border-white", r"border-b\b"],  # bottom border separator

    # ---- Settings Screen: Typography ----
    "ST01": [r"(DM.Sans|dm.sans|font-family.*sans)", r"(font-sans|Inter|system-ui)"],
    "ST02": [r"font-semibold", r"font-bold"],  # in settings file, semibold = section titles
    "ST03": [r"(#9ca3af|#6b7280|text-muted|text-secondary|text-gray-400|text-gray-500)"],
    "ST04": [r"text-\[12px\]", r"text-xs"],  # in settings file, 12px = tab labels
}


def evaluate_screen(code, screen_config):
    """Evaluate a single screen's code against its checks."""
    checks = screen_config["checks"]
    results = []
    total_score = 0
    max_score = 0

    all_checks = []
    for category in ["structural", "layout", "visual", "typography"]:
        for check in checks.get(category, []):
            all_checks.append((category, check))

    for category, check in all_checks:
        cid = check["id"]
        weight = check["weight"]
        max_score += weight

        # Special cases
        if cid == "WS06":
            step_count = sum(1 for label in ["Start Proxy", "Select Agent", "Start Chatting"]
                           if re.search(re.escape(label), code, re.IGNORECASE))
            passed = step_count >= 3
        elif cid == "SS02":
            tab_count = sum(1 for tab in ["General", "Agents", "Permissions", "Connection"]
                          if re.search(r"\b" + re.escape(tab) + r"\b", code, re.IGNORECASE))
            passed = tab_count >= 4
        elif cid == "SS04":
            btn_count = sum(1 for btn in ["Dark", "Light", "System"]
                          if re.search(r"\b" + re.escape(btn) + r"\b", code, re.IGNORECASE))
            passed = btn_count >= 3
        elif cid == "SS10":
            # Toggle ON: need both toggle element AND accent/green color reference
            passed = check_all(code, r"(toggle|switch|knob|track|translate)", r"(#6ee7b7|accent|green|emerald)")
        else:
            patterns = PATTERNS.get(cid, [])
            passed = check_pattern(code, patterns) if patterns else False

        score = weight if passed else 0
        total_score += score
        results.append({
            "id": cid, "desc": check["desc"], "passed": passed,
            "score": score, "max": weight, "category": category
        })

    normalized = round(total_score / max_score * 100) if max_score > 0 else 0
    return normalized, total_score, max_score, results


def main():
    design = load_design()
    screens = design["screens"]

    screen_scores = []
    all_screen_results = []

    for screen_key, screen_config in screens.items():
        filename = screen_config["file"]
        filepath = os.path.join(OUTPUT_DIR, filename)
        code = load_file(filepath)

        if not code.strip():
            print(f"\n=== {screen_config['name']} === SKIPPED (no file: {filename})")
            screen_scores.append(0)
            all_screen_results.append((screen_key, screen_config["name"], 0, 0, 0, []))
            continue

        normalized, raw, max_score, results = evaluate_screen(code, screen_config)
        screen_scores.append(normalized)
        all_screen_results.append((screen_key, screen_config["name"], normalized, raw, max_score, results))

    # Print detailed results per screen
    for screen_key, name, normalized, raw, max_score, results in all_screen_results:
        print(f"\n=== {name} === {normalized}/100 (raw: {raw}/{max_score})")
        if not results:
            continue

        categories = {}
        cat_names = {"structural": "Structural", "layout": "Layout", "visual": "Visual", "typography": "Typography"}
        for r in results:
            cat = r["category"]
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(r)

        for cat_key in ["structural", "layout", "visual", "typography"]:
            if cat_key not in categories:
                continue
            items = categories[cat_key]
            cat_score = sum(i["score"] for i in items)
            cat_max = sum(i["max"] for i in items)
            print(f"[{cat_names[cat_key]}] {cat_score}/{cat_max}")
            for item in items:
                mark = "PASS" if item["passed"] else "FAIL"
                print(f"  [{mark}] {item['id']}: {item['desc']} ({item['score']}/{item['max']})")

    # Final average score
    if not screen_scores:
        print("\nstructural_score: 0")
        sys.exit(1)

    avg_score = round(sum(screen_scores) / len(screen_scores))
    print(f"\n--- Summary ---")
    for (screen_key, name, normalized, _, _, _) in all_screen_results:
        print(f"  {name}: {normalized}/100")
    print(f"  Average: {avg_score}/100")
    print(f"\nstructural_score: {avg_score}")


if __name__ == "__main__":
    main()
