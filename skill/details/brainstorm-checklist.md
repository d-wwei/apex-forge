# Brainstorm Checklist — Full Detail

## The 9-Step Checklist

**Note**: If any step below surfaces more than 5 open issues, switch to
the Multi-Issue Discussion Protocol before continuing.

### Step 1: Clarify the Actual Problem
- What is broken, missing, or suboptimal?
- Who is affected and how?
- What is the current behavior vs. desired behavior?
- Restate the problem in one sentence to confirm alignment.

**Output**: Problem statement (2-3 sentences max).

### Step 2: Identify Constraints and Boundaries
- What MUST NOT change? (existing contracts, public APIs, data formats)
- What are the performance, security, or compatibility requirements?
- What is explicitly out of scope?

**Output**: Constraints list.

### Step 3: Enumerate Approaches (Minimum 2)
- Generate at least 2 distinct approaches (3 for Deep scope).
- Each approach described in 2-4 sentences.
- Include the "do nothing" option if relevant.

**Output**: Numbered approach list with brief descriptions.

### Step 4: Evaluate Trade-offs
- For each approach: Pros, Cons, Risks.
- Use a comparison table for Standard and Deep scope.

**Output**: Trade-off analysis.

### Step 5: Define Acceptance Criteria
- What must be true for the work to be considered done?
- Each criterion must be testable. Minimum 3 for Standard, 5 for Deep.
- Use "Given / When / Then" format where applicable.

**Output**: Numbered acceptance criteria list.

### Step 6: Identify Risks and Mitigations
- What could go wrong during implementation or after deployment?
- For each risk: probability, impact, mitigation strategy.
- Skip for Lightweight scope unless a risk is obvious.

**Output**: Risk table with mitigation column.

### Step 7: Specify Dependencies
- What existing code, services, or libraries does this depend on?
- What must be built first? Any blocking unknowns?

**Output**: Dependency list with status (available / needs-work / unknown).

### Step 8: Draft the Solution Shape
- Describe the chosen approach at a high level.
- Identify key components, responsibilities, and interactions.
- NO implementation code. Directional descriptions only.
- **Complexity check**: Does the solution have more stages, layers, or
  abstractions than the problem warrants? If the plan requires 4+ phases,
  multiple new abstraction layers, or introduces requirements the user
  didn't mention — present the simplest viable version first, then ask
  if the user wants more.

**Output**: Solution shape description.

### Step 9: User Approval Checkpoint
- Present the complete requirements summary.
- Ask explicitly for approval.
- Do NOT auto-approve. Do NOT interpret silence as approval.

**Output**: User's decision (approved / revise / reject).

---

## Multi-Issue Discussion Protocol

When Brainstorm identifies N > 5 issues to resolve (e.g., gap analysis,
risk enumeration, open questions), this protocol replaces linear one-by-one
discussion.

### Step A: Panoramic View

List ALL issues with one-line summary + severity (Critical / High / Medium).
Do NOT expand any solutions yet.

### Step B: User Triage

Ask the user to mark which issues need deep discussion:

> "以上 {N} 个问题，哪些需要逐个深入讨论？
>  其余的我会给出一句话方案，你批量确认。"

### Step C: Group by Dependency

Group issues that share premises or depend on each other. Discuss
each group as a unit, not as separate items. Example: if two issues
both depend on "does the platform support hooks?", discuss them together.

### Step D: Batch the Rest

Issues NOT marked for deep discussion: present all solutions in one
message. User confirms, modifies, or flags individual items for
deeper discussion.

### Prohibited Patterns

| Pattern | Why It Fails | Correct Response |
|---------|-------------|-----------------|
| Linear one-by-one expansion of all items | Wastes time on low-priority issues | Use Step B triage |
| Full solution for every item before asking user | Over-designs low-priority items | Batch simple items (Step D) |
| Discussing related issues separately | Misses shared premises, causes redundant discussion | Group by dependency (Step C) |
| Asking "展开全部还是只展开 Critical" | Locks user into all-or-nothing choice | Step B lets user pick individual items |

---

## Roadmap Context — Full Reading Algorithm

5. Check for roadmap sources in this order:
   a. `docs/roadmaps/` directory exists and contains `roadmap-*.md` files → use **snapshot mode**
      (If the directory exists but contains no `roadmap-*.md` files, treat as if it does not exist — fall through to 5b.)
   b. `docs/iteration-roadmap.md` exists → **legacy mode**, read as single file (treat as before)
   c. Neither exists → skip roadmap awareness

6. **Snapshot mode reading algorithm**:
   a. List all `roadmap-*.md` files in `docs/roadmaps/`, sort by filename (lexicographic = chronological).
   b. Read the **latest** snapshot fully — this is the baseline.
   c. Read its `based_on` frontmatter field to get the set of already-incorporated snapshots.
   d. Identify **unmerged** snapshots: files NOT in `based_on` AND NOT the baseline itself.
      Compare by **bare filename** (e.g., `roadmap-20260412T1100.md`), not full path.
   e. If no unmerged snapshots exist → use baseline only (**fast path**, most common case).
   f. If unmerged snapshots exist → scan each one, extract planning items NOT present in baseline.

7. **Completion check** (for planning items in scope):
   - For each item with a **验证** (verification) field: run the listed glob/grep checks against code
     exactly as written in the hint. Mark as completed if all criteria pass, pending otherwise.
   - For items **without** verification hints: leave as pending. Do NOT attempt a full codebase scan.
   - If a verification hint errors out (malformed pattern, path no longer valid): leave as pending
     and note the broken hint for the next iteration-reflector to fix.

8. Synthesize and present:
   - Read the **当前状态速览** and **建议的下一个迭代** sections from the baseline.
   - If unmerged items were found, mention them:
     > "I found {N} additional planning items from parallel iterations that aren't in the latest roadmap."
   - If the user's request aligns with a Roadmap item, mention it:
     > "This aligns with a Roadmap item from a previous iteration: {item}. I'll use that context."
   - If the user starts a fresh brainstorm without a specific request, surface
     the top 3 Roadmap items as suggestions (combining baseline + unmerged items):
     > "The Roadmap from previous iterations suggests these priorities: ..."

9. Do NOT auto-select a Roadmap item. The user decides what to work on next.
