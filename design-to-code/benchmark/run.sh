#!/usr/bin/env bash
# Benchmark runner: generates code for multiple screens, then evaluates.
# Usage: bash benchmark/run.sh
# Output: prints structural_score to stdout (average across screens)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BENCHMARK_DIR="$REPO_DIR/benchmark"
OUTPUT_DIR="$BENCHMARK_DIR/output"
PROMPTS_DIR="$BENCHMARK_DIR/.prompts"

# Clean previous output
rm -rf "$OUTPUT_DIR" "$PROMPTS_DIR"
mkdir -p "$OUTPUT_DIR" "$PROMPTS_DIR"

# Read scaffold files for context
AGENTS_MD=$(cat "$REPO_DIR/AGENTS.md")
WORKFLOW_SOP=$(cat "$REPO_DIR/workflows/agent-execution-sop.md")

# Shared color tokens block
TOKENS='Color tokens (use as Tailwind arbitrary values like bg-[#0f1117]):
- bg-primary: #0f1117
- bg-card: #1e2538
- bg-input: #1a1d26
- accent: #6ee7b7
- text-primary: #d1d5db
- text-secondary: #9ca3af
- text-muted: #6b7280
- border: rgba(255,255,255,0.18)
- border-card: rgba(255,255,255,0.19)
- user-bubble: #0d3b3c
- success: #6ee7b7
- error: #f87171'

# ============================================================
# Screen 1: Welcome State
# ============================================================
cat > "$PROMPTS_DIR/welcome.txt" <<PROMPT_END
Generate a single React TypeScript component file (WelcomeScreen.tsx) using Tailwind CSS. Output ONLY code — no explanations, no markdown.

Design spec:
- App: "ACP Browser Client" — dark-themed browser extension UI
- Screen: Welcome State (400x780)
- Font: DM Sans, sans-serif
- Icons: lucide-react

$TOKENS

Layout (flex flex-col, full height):

1. TopBar (h-12, flex justify-between, bg-[#1e2538], shadow, border-b border-white/20):
   - Left: agent icon (Globe, 20px) + "Mock Agent" text + ChevronDown icon
   - Right: green dot (w-2 h-2 rounded-full bg-[#6ee7b7]) + "Connected" text-xs + Wifi icon + Bell icon + Settings icon

2. EmptyContent (flex-1, flex flex-col items-center justify-center, px-10, gap-6):
   - Logo: 56x56 rounded-2xl bg-[#1e2538] border border-white/20 shadow-lg, centered Globe icon in accent color
   - Title: "ACP Browser Client" text-lg font-bold text-[#d1d5db]
   - Subtitle: "Connect AI agents to your browser" text-sm text-[#9ca3af]
   - Steps (flex flex-col gap-5, w-full):
     - Step 1: <div className="step-row flex flex-row gap-3 items-start">. Left: step number badge (w-6 h-6 rounded-full bg-[#6ee7b7] text-black text-xs font-bold flex items-center justify-center showing "1"). Right: flex-col. Title "Start Proxy Server" font-semibold text-[#d1d5db]. Desc "Run the proxy server to bridge your browser with AI agents" text-sm text-[#6b7280]. Code block: bg-[#1a1d26] rounded-lg px-3 py-2 font-mono text-sm text-[#6ee7b7] showing "npx @anthropic-ai/acp-browser-proxy"
     - Step 2: same step-row flex-row layout with number badge. Number "2". Title "Select Agent". Desc "Choose an AI agent from the dropdown above"
     - Step 3: same step-row flex-row layout with number badge. Number "3". Title "Start Chatting". Desc "Send a message, attach page content, or use / shortcuts"
   - Help text: "Need help? Check the " + link "documentation" in accent color

3. InputBar (bg-[#1e2538], border-t border-white/20, shadow-[0_-2px_6px_rgba(0,0,0,0.12)]):
   - Row (flex items-center gap-2, px-3 py-2):
     - <button aria-label="attach" className="clipBtn text-[#6b7280]"><Paperclip /></button>
     - <button aria-label="screenshot" className="text-[#6b7280]"><Camera /></button>
     - Input (flex-1, bg-transparent, placeholder "Waiting for connection...", text-sm)
     - <button aria-label="send" className="sendBtn text-[#6ee7b7]"><Send /></button>

Start your response with "import" — output the complete component code only.
PROMPT_END

# ============================================================
# Screen 2: Chat State
# ============================================================
cat > "$PROMPTS_DIR/chat.txt" <<PROMPT_END
Generate a single React TypeScript component file (ChatScreen.tsx) using Tailwind CSS. Output ONLY code — no explanations, no markdown.

Design spec:
- App: "ACP Browser Client" — dark-themed chat interface
- Screen: Chat State (400x780)
- Font: DM Sans, sans-serif
- Icons: lucide-react

$TOKENS

Layout (flex flex-col, full height):

1. TopBar (h-12, flex items-center justify-between, px-3, bg-[#1e2538], shadow):
   - Left: PenTool icon (16px, text-[#6ee7b7]) + "Claude Agent" text (13px, font-medium, text-[#d1d5db]) + ChevronDown icon (14px, text-[#6b7280])
   - Right: green dot (w-2 h-2 rounded-full bg-[#6ee7b7]) + "Connected" (text-[11px] text-[#6ee7b7]) + List icon + History icon + Settings icon (all 18px text-[#9ca3af])

2. ChatArea (flex-1, flex flex-col gap-4, p-4, overflow-y-auto):
   - User message 1 (flex justify-end):
     - Bubble: bg-[#0d3b3c] border border-[#6ee7b733] rounded-xl rounded-br-sm px-3.5 py-2.5
     - Text: "What's on my current page?" (13px, text-[#d1d5db])
     - Timestamp: "10:23 AM" (text-right, text-[11px], text-[#6b7280])
   - Agent message 1 (flex justify-start):
     - Bubble: bg-[#1e2538] border border-white/20 rounded-xl rounded-bl-sm px-3.5 py-2.5 shadow-sm, max-w-[300px]
     - Text: "I can see you're on a GitHub repository page. Here's what I found:" (13px, text-[#d1d5db], leading-relaxed)
     - Code block: bg-[#1a1d26] border border-white/20 rounded-lg px-3 py-2 font-mono text-[12px] text-[#d1d5db] containing:
       Repository: anthropic-ai/acp
       Branch: main
       Stars: 2.4k
     - Timestamp: "10:22 AM" (text-[11px], text-[#6b7280])
   - User message 2 (flex justify-end):
     - Same bubble style as message 1
     - Text: "Summarize the README for me"
     - Timestamp: "10:24 AM"
   - Typing indicator (flex justify-start):
     - Bubble: bg-[#1e2538] border border-white/20 rounded-xl rounded-bl-sm px-3.5 py-2.5
     - Three animated dots: 3 small circles (w-1.5 h-1.5 rounded-full bg-[#6b7280]) with decreasing opacity (0.8, 0.5, 0.3), gap-1.5, add animate-pulse or CSS animation

3. InputBar (bg-[#1e2538], border-t border-white/20, shadow-[0_-2px_6px_rgba(0,0,0,0.12)]):
   - Row (flex items-center gap-2, px-3 py-2):
     - <button aria-label="attach" className="clipBtn text-[#6b7280]"><Paperclip size={18} /></button>
     - <button aria-label="screenshot" className="text-[#6b7280]"><Camera size={18} /></button>
     - Input field: h-9 flex-1 bg-[#1a1d26] rounded-[10px] border border-white/20 px-3 text-[13px] placeholder "Type a message..."
     - <button aria-label="send" className="sendBtn text-[#6ee7b7]"><Send size={18} /></button>

Start your response with "import" — output the complete component code only.
PROMPT_END

# ============================================================
# Screen 3: Settings - General
# ============================================================
cat > "$PROMPTS_DIR/settings.txt" <<PROMPT_END
Generate a single React TypeScript component file (SettingsScreen.tsx) using Tailwind CSS. Output ONLY code — no explanations, no markdown.

Design spec:
- App: "ACP Browser Client" — dark-themed settings panel
- Screen: Settings - General (400x780)
- Font: DM Sans, sans-serif
- Icons: lucide-react

$TOKENS

Layout (flex flex-col, full height):

1. SettingsHeader (h-12, flex items-center justify-between, px-4, border-b border-white/20):
   - Left: "Settings" text (15px, font-semibold, text-[#d1d5db])
   - Right: <button><X size={16} className="text-[#6b7280]" /></button>

2. TabBar (flex gap-1, px-4, border-b border-white/20):
   - Tab "General": active state — text-[#6ee7b7] with border-b-2 border-[#6ee7b7], px-3 py-2.5, text-[12px] font-medium
   - Tab "Agents": inactive — text-[#6b7280], same padding/size
   - Tab "Permissions": inactive — text-[#6b7280]
   - Tab "Connection": inactive — text-[#6b7280]

3. ContentArea (flex-1, flex flex-col gap-4, p-4, overflow-y-auto):

   a. ThemeCard (bg-[#1e2538] rounded-xl border border-white/20 shadow-lg p-4):
      - Title: "Theme" (13px, font-semibold, text-[#d1d5db])
      - Button row (flex gap-3, mt-3):
        - Dark button: h-9 flex-1 rounded-lg border border-white/20 flex items-center justify-center text-[12px] text-[#d1d5db]
        - Light button: same style
        - System button: ACTIVE state — bg-[#6ee7b71a] border-[#6ee7b766] text-[#6ee7b7], same dimensions

   b. ContextCard (bg-[#1e2538] rounded-xl border border-white/20 shadow-lg p-4, flex items-center justify-between):
      - Left side (flex-1):
        - Title: "Agent Browser Context" (13px, font-semibold, text-[#d1d5db])
        - Description: "Auto snapshot browser state before each prompt" (12px, text-[#9ca3af])
      - Right side: toggle switch in ON state
        - Track: w-10 h-[22px] rounded-full bg-[#6ee7b74d]
        - Knob: w-4 h-4 rounded-full bg-[#6ee7b7] translated to the right

   c. AboutCard (bg-[#1e2538] rounded-xl border border-white/20 shadow-lg p-4, flex flex-col gap-2):
      - Title: "About" (13px, font-semibold, text-[#d1d5db])
      - Version: "ACP Browser Client v0.1.0" (12px, text-[#9ca3af])
      - Description: "Agent Communication Protocol for browser-based AI agent interaction." (12px, text-[#9ca3af], leading-relaxed)

Start your response with "import" — output the complete component code only.
PROMPT_END

# ============================================================
# Generate all screens
# ============================================================
generate_screen() {
    local prompt_file="$1"
    local output_file="$2"
    local screen_name="$3"

    echo "[benchmark] Generating $screen_name..." >&2
    claude --print --output-format text < "$prompt_file" > "$output_file" 2>/dev/null || true

    # Strip markdown fences if present
    sed -i '' '/^```/d' "$output_file" 2>/dev/null || true

    # Verify output looks like code
    if [ ! -s "$output_file" ] || ! grep -q "import\|export\|function\|const\|React" "$output_file"; then
        echo "[benchmark] WARNING: $screen_name generation failed" >&2
        echo "" > "$output_file"
    fi
}

generate_screen "$PROMPTS_DIR/welcome.txt" "$OUTPUT_DIR/WelcomeScreen.tsx" "Welcome State"
generate_screen "$PROMPTS_DIR/chat.txt" "$OUTPUT_DIR/ChatScreen.tsx" "Chat State"
generate_screen "$PROMPTS_DIR/settings.txt" "$OUTPUT_DIR/SettingsScreen.tsx" "Settings - General"

# Cleanup
rm -rf "$PROMPTS_DIR"

echo "[benchmark] Generation complete. Evaluating..." >&2

# Run evaluation
python3 "$BENCHMARK_DIR/evaluate.py"
