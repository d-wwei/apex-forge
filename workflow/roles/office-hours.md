---
name: apex-forge-office-hours
description: Structured brainstorming and idea exploration with forcing questions and design doc output
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Office Hours Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX OFFICE HOURS ==="
apex_set_stage "office-hours"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "office-hours"

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mkdir -p "docs/designs" 2>/dev/null || true

# Check for existing design docs
EXISTING_DESIGNS=$(find docs/designs -name "*.md" -type f 2>/dev/null | sort -r | head -5)
if [ -n "$EXISTING_DESIGNS" ]; then
  echo "[office-hours] Found existing design docs:"
  echo "$EXISTING_DESIGNS"
  echo ""
fi

# Detect project context for smarter questions
PROJECT_TYPE="unknown"
[ -f "package.json" ] && PROJECT_TYPE="node"
[ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && PROJECT_TYPE="python"
[ -f "Cargo.toml" ] && PROJECT_TYPE="rust"
[ -f "go.mod" ] && PROJECT_TYPE="go"
[ -f "Gemfile" ] && PROJECT_TYPE="ruby"

echo "[office-hours] Project type: $PROJECT_TYPE"
echo "[office-hours] Ready for brainstorming."

apex_ensure_dirs
```

# Office Hours Role

> apex-forge / workflow / roles / office-hours
>
> Structured brainstorming for ideas, features, and side projects.
> Not free-form chatting — forcing questions that expose assumptions
> and sharpen thinking.

---

## MODE SELECTION

Office hours operates in two modes. Detect from context or ask.

### Startup Mode

**When**: The user is exploring a new product idea, business concept, or market opportunity.

**Signal phrases**: "I have an idea for...", "What if we built...", "Is there a market for...",
"I want to start...", "Would people pay for..."

### Builder Mode

**When**: The user is designing a feature, side project, hackathon entry, or learning project.

**Signal phrases**: "I want to add...", "How should I build...", "Let's design...",
"I'm thinking about a feature that...", "For the hackathon..."

---

## STARTUP MODE: THE SIX FORCING QUESTIONS

These questions are not optional. Each one exposes a different assumption
that kills most ideas. Ask them in order. Do not skip any.

### Q1: Demand Reality

```
"Who specifically needs this? Not 'developers' or 'businesses.'
Name the person. What is their job title? What did they do
in the last 48 hours that made them wish this existed?"
```

**What you're testing**: Does real demand exist, or is this a solution looking for a problem?

**Red flags**:
- "Everyone could use this" (no one will)
- "I think people would..." (you don't know)
- Cannot name a specific person (demand is theoretical)

**Good answers**:
- Names a specific role with a specific pain
- Describes a recurring workflow they've observed
- Has talked to someone who confirmed the pain

### Q2: Status Quo

```
"What do they do TODAY to solve this problem? How much time/money
does the current solution cost them? Why haven't they switched
to something better already?"
```

**What you're testing**: Is the pain acute enough to drive behavior change?

**Red flags**:
- "There's nothing out there" (there's always something — even doing nothing is a solution)
- "They use spreadsheets" (spreadsheets are unkillable; you need a 10x story)
- Cannot describe the switching cost

### Q3: Desperate Specificity

```
"If this product only worked for ONE specific use case,
what would that use case be? Describe it in one sentence.
Now: would that alone be worth paying for?"
```

**What you're testing**: Can the idea survive radical scope reduction?

**Red flags**:
- Cannot narrow to one use case
- The narrow version is not independently valuable
- "It only works if you use ALL the features"

### Q4: Narrowest Wedge

```
"What is the smallest possible version of this that delivers
real value? Not an MVP with 20 features. The single thing
you could build in a weekend that someone would use on Monday."
```

**What you're testing**: Can you ship something useful FAST?

**Red flags**:
- "We need X, Y, and Z before it's useful" (too coupled)
- The "smallest version" is still 3 months of work
- Cannot describe value without referencing future features

### Q5: Observation Over Opinion

```
"Have you seen someone struggle with this problem firsthand?
Not 'I imagine people struggle' — have you WATCHED someone
fail at this? What happened?"
```

**What you're testing**: Is this insight based on observation or imagination?

**Red flags**:
- "I assume..." / "I think..." / "People probably..."
- No first-hand observation
- Pain is inferred from articles, not from watching real behavior

### Q6: Future-Fit

```
"In 3 years, will AI, market changes, or platform shifts
make this problem disappear on its own? If the problem still
exists in 3 years, will your solution still be the right shape?"
```

**What you're testing**: Is this a durable opportunity or a timing window?

**Red flags**:
- AI could trivially solve this by next year
- Depends on a platform that could change its API
- The market is already consolidating

---

## BUILDER MODE: DESIGN THINKING

For features, side projects, and learning experiments.

### Step 1: Frame the Problem

```
Answer these three questions:
1. WHO needs this? (specific user persona, not "everyone")
2. WHAT do they do today? (current workflow, even if manual)
3. WHY is this 10x better? (not 2x — why would they switch?)
```

If the user cannot answer #3, the feature is a nice-to-have, not a need-to-have.
Note this honestly but continue — side projects and learning don't require 10x.

### Step 2: Enumerate Approaches

Generate at least 3 approaches. For each:

```
Approach: [name]
Effort: [hours/days estimate]
Complexity: [low / medium / high]
Dependency: [what must exist first]
Risk: [what could go wrong]
Learning: [what you'd learn by building this]
```

Do not recommend an approach yet. Present all three and discuss tradeoffs.

### Step 3: Challenge Assumptions

For the user's preferred approach, run the adversarial filter:

1. **What would make this fail?** Not edge cases — fundamental failure modes.
   "What if users don't understand the UI?" "What if the API rate limit is 10/min?"

2. **What is the narrowest wedge?** Same as Startup Q4. Strip features until
   you reach the irreducible core.

3. **What can you steal?** Existing libraries, APIs, templates, patterns.
   Never build what you can borrow.

4. **What will you learn?** Even if the project fails, what skills or knowledge
   make the attempt worthwhile?

### Step 4: Scope and Sequence

Once an approach is selected:

1. **Define the spike**: What is the first 2-hour block of work? What will you
   know at the end that you don't know now?

2. **Define done**: What does "finished enough" look like? Not perfect — shippable.

3. **Define checkpoints**: Break the work into 3-5 milestones. Each should produce
   something demoable.

---

## DESIGN DOC OUTPUT

At the end of either mode, produce a design doc:

Write to `docs/designs/{name}-design.md`:

```yaml
---
title: "{idea/feature name}"
date: "{ISO date}"
mode: startup | builder
status: draft | reviewed | approved | abandoned
author: "{user name}"
---
```

### Design Doc Structure

**1. One-liner**: What is this in one sentence?

**2. Problem**: Who has this problem and why does it matter?
- For startup mode: answers from Q1, Q2, Q5
- For builder mode: the Frame the Problem answers

**3. Proposed Solution**: What are we building?
- High-level description (no implementation details)
- What it IS and what it IS NOT

**4. Approaches Considered**: List all approaches with tradeoffs.
- Selected approach highlighted with rationale

**5. Narrowest Wedge**: The absolute minimum shippable version.
- For startup mode: answer from Q4
- For builder mode: the spike definition

**6. Risks and Assumptions**:
- Each risk with mitigation strategy
- Each assumption with validation plan
- For startup mode: Q6 future-fit analysis

**7. Success Criteria**: How do we know this worked?
- Measurable outcomes, not "users like it"

**8. Next Steps**: Concrete actions with owners.

```
apex_add_artifact "office-hours" "docs/designs/{name}-design.md"
```

---

## ANTI-PATTERNS

| Anti-Pattern | Detection | Correction |
|-------------|-----------|------------|
| Feature shopping | "And it could also do X, Y, Z..." | Return to Q4/Narrowest Wedge. Kill scope. |
| Hypothetical users | "People would love..." | Return to Q1/Q5. Name a real person. |
| Technology-first | "I want to use {tech}" | "What problem does that solve?" Reframe to problem-first. |
| Premature architecture | "We need microservices for..." | "What is the simplest thing that works?" |
| Analysis paralysis | "But what about..." (loop) | "Which approach can you test in 2 hours?" Pick and go. |

---

## TRANSITION SUGGESTIONS

After design doc is written:
- Idea has legs → suggest `/apex-forge-brainstorm` to formalize requirements
- Ready to plan → suggest `/apex-plan` to create execution plan
- Needs validation → suggest user research or prototype spike
- Idea is weak → say so honestly. "The demand signal is not strong enough.
  Recommend parking this and revisiting after talking to 3 potential users."

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Design doc produced, all forcing questions answered |
| **DONE_WITH_CONCERNS** | Design doc produced but key assumptions unvalidated |
| **BLOCKED** | Cannot proceed — fundamental question unanswerable without research |
| **NEEDS_CONTEXT** | User's domain requires more information to evaluate |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
