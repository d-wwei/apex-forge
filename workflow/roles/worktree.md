---
name: apex-forge-worktree
description: Create isolated git worktrees for feature work
user-invocable: true
---

# Git Worktree Management

## Purpose

Isolate feature work in a separate working directory so the main tree stays clean.
Worktrees let you run tests on one branch while coding on another, avoid stash juggling,
and keep multi-task work physically separated.

---

## Directory Selection Priority

When creating a worktree, choose the directory in this order:

1. `.worktrees/` — preferred default (clean, obvious)
2. `worktrees/` — if the project already uses this convention
3. `.apex/worktrees/` — if the project uses `.apex/` as its meta directory
4. Ask the user — if none of the above exist and you cannot determine preference

Once a directory is chosen for a project, reuse it for all future worktrees in that project.

---

## Safety Verification (BEFORE creating)

Before creating any worktree, verify the worktree directory is git-ignored.
This is not optional. Committed worktree directories cause repo corruption and confusion.

### Check

```bash
# Check if the chosen directory is already in .gitignore
grep -qF '{worktree-dir}/' .gitignore 2>/dev/null
```

### If NOT in .gitignore

1. Add the directory to `.gitignore`:
   ```bash
   echo '{worktree-dir}/' >> .gitignore
   ```
2. Commit the `.gitignore` change FIRST:
   ```bash
   git add .gitignore
   git commit -m "chore: add {worktree-dir}/ to .gitignore"
   ```
3. Only then proceed to create the worktree.

### If .gitignore does not exist

1. Create it with the worktree directory as the first entry.
2. Commit it before proceeding.

---

## Creation Steps

### Step 1: Choose directory

Apply the directory selection priority above. Create the directory if it does not exist:

```bash
mkdir -p {worktree-dir}
```

### Step 2: Determine branch name

- If a task ID is available (from the apex task system): use `apex/{task-id}` as branch name.
  Example: `apex/AUTH-003`
- If no task ID: use a descriptive slug. Example: `fix-jwt-refresh`
- Never use generic names like `feature` or `work`.

### Step 3: Create the worktree

```bash
git worktree add {worktree-dir}/{branch-name} -b {branch-name}
```

This creates a new branch AND a new working directory in one command.

### Step 4: Switch session working directory

```bash
cd {worktree-dir}/{branch-name}
```

Confirm the switch:

```bash
pwd
git branch --show-current
```

### Step 5: Verify

```bash
git worktree list
```

Expected output shows both the main tree and the new worktree with its branch.

---

## List Active Worktrees

At any time, show all active worktrees:

```bash
git worktree list
```

This shows path, HEAD commit, and branch for each worktree.

---

## Working in a Worktree

- The worktree is a full working directory. All git commands work normally.
- Commits made in the worktree are on the worktree's branch, not the main branch.
- You can run tests, build, and verify independently of the main tree.
- Do not manually move or rename worktree directories — git tracks them.

---

## Cleanup

After work is done (branch merged, task completed, or work abandoned):

### Offer to clean up

Prompt the user: "The worktree for `{branch-name}` is no longer needed. Remove it?"

### If confirmed

1. Return to the main tree:
   ```bash
   cd {main-repo-path}
   ```

2. Remove the worktree:
   ```bash
   git worktree remove {worktree-dir}/{branch-name}
   ```

3. If the branch was merged or is no longer needed, delete it:
   ```bash
   git branch -d {branch-name}
   ```
   Use `-d` (safe delete) — it will refuse if the branch has unmerged work.

4. Verify cleanup:
   ```bash
   git worktree list
   ```

### If the worktree is dirty (uncommitted changes)

Do NOT force-remove. Warn the user:
"The worktree has uncommitted changes. Commit or stash them before removing."

```bash
git worktree remove {worktree-dir}/{branch-name} --force
```

Only use `--force` if the user explicitly confirms they want to discard changes.

---

## Task System Integration

When the apex task system is active:

| Task state | Worktree action |
|---|---|
| Task assigned | Create worktree with branch `apex/{task-id}` |
| Task in progress | Work in the worktree |
| Task done, PR merged | Offer to remove worktree and branch |
| Task blocked | Keep worktree alive, note blocker |
| Task abandoned | Offer to remove worktree with confirmation |

---

## Failure Modes

| Problem | Resolution |
|---|---|
| Branch already exists | Ask user: reuse existing branch or pick a new name? |
| Worktree dir already exists | Check if it is a valid worktree (`git worktree list`). If stale, prune first: `git worktree prune` |
| Cannot create worktree (locked) | Run `git worktree prune` to clean stale entries, then retry |
| Detached HEAD in worktree | Likely a stale worktree. Prune and recreate. |
