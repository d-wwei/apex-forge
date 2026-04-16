# Session Resume — Detailed Procedures

## Task State Reconciliation (MANDATORY before resuming)

If there are tasks that are NOT `done` (i.e. `open`, `assigned`, `in_progress`, `to_verify`):

1. **Cross-check each incomplete task against the actual codebase:**
   - Read the task's description and target files
   - Check if those files exist, have been modified, or committed via `git log --oneline -5` / `git diff --stat`
   - If the code is already done but the task status is stale (e.g. sub-agent completed in a worktree but status was never updated), fix it:
     ```bash
     apex task assign T{N} && apex task start T{N} && apex task submit T{N} "evidence: code verified in repo" && apex task verify T{N} pass
     ```

2. **After reconciliation**, report the corrected state to the user.

This handles: sub-agent work merged but not reflected in dashboard, user commits outside AF, stale status from crashes.

If stage is not `idle` or tasks are `in_progress`/`to_verify` (after reconciliation):
> 上次中断在 {stage} 阶段。{N} 个任务未完成（{task IDs}）。要继续还是重新开始？

---

## Background Update Check

After init, unconditionally spawn a **background Agent** (fire-and-forget) with this prompt:

> Check `.apex/update-check.json` (written by session-start hook).
> If the file does not exist or `updates_available` is empty, exit silently.
> If updates are available, run `bash {PLUGIN_ROOT}/skill/install.sh update`.
> After each skill updates successfully, read its README.md (or SKILL.md) and write a brief
> upgrade note to `.apex/upgrade-notes/{skill-name}.md` covering: what changed,
> new outputs/assets, and how to use them. Keep each note under 200 words.
> Delete `.apex/update-check.json` when done.

**The main agent MUST NOT read the JSON, check conditions, or do any update logic itself.**
All update-related work is isolated in the sub-agent. If the sub-agent fails, the main agent is unaffected.

**Stage-aware update adoption:**

- **Current stage already using that skill** → Do NOT interrupt. Finish the current stage with the loaded version.
- **Skill not yet used / will be used in a later stage** → No action now. The upgrade notes at
  `.apex/upgrade-notes/` will be checked automatically when that skill is invoked (per "Upgrade notes" below).
  This gives the user better results without disruption.
- **Sub-agent completion notifications** → Ignore them. All information flows through `.apex/upgrade-notes/`,
  not through notification events. Never interrupt the user's flow to announce updates.

---

## Upgrade Notes

Before invoking any external skill from `bindings.yaml`, check if `.apex/upgrade-notes/{skill-name}.md` exists.
If it does, read it and surface the content as context before the skill runs.
After surfacing, rename to `.apex/upgrade-notes/{skill-name}.surfaced.md` to avoid repeating.
