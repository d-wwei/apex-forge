#!/usr/bin/env python3
"""Create task-local design-to-code artifacts from repository templates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil


def derive_title(task_id: str) -> str:
    return task_id.replace("-", " ").replace("_", " ").strip().title()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def copy_with_replacements(src: Path, dest: Path, task_id: str, title: str, force: bool) -> None:
    if dest.exists() and not force:
        raise FileExistsError(f"{dest} already exists. Use --force to overwrite.")

    content = read_text(src)
    content = content.replace("replace-with-task-id", task_id)
    content = content.replace("replace-with-task-title", title)
    write_text(dest, content)


def bootstrap(repo_root: Path, task_dir: Path, task_id: str, title: str, force: bool) -> None:
    spec_template = repo_root / "specs" / "implementation-spec.template.yaml"
    map_template = repo_root / "specs" / "component-map.template.json"
    checklist_template = repo_root / "templates" / "acceptance-checklist.md"

    required = [spec_template, map_template, checklist_template]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing repository templates:\n" + "\n".join(missing))

    task_dir.mkdir(parents=True, exist_ok=True)

    copy_with_replacements(spec_template, task_dir / "implementation-spec.yaml", task_id, title, force)
    copy_with_replacements(checklist_template, task_dir / "acceptance-checklist.md", task_id, title, force)

    map_dest = task_dir / "component-map.json"
    if map_dest.exists() and not force:
        raise FileExistsError(f"{map_dest} already exists. Use --force to overwrite.")

    map_data = json.loads(read_text(map_template))
    map_data["taskId"] = task_id
    write_text(map_dest, json.dumps(map_data, indent=2, ensure_ascii=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap task-local design-to-code artifacts.")
    parser.add_argument("--repo-root", required=True, help="Repository root containing specs/ and templates/")
    parser.add_argument("--task-dir", required=True, help="Directory to create task-local files in")
    parser.add_argument("--task-id", help="Task id. Defaults to the task directory name.")
    parser.add_argument("--title", help="Task title. Defaults to a titleized task id.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).expanduser().resolve()
    task_dir = Path(args.task_dir).expanduser().resolve()
    task_id = args.task_id or task_dir.name
    title = args.title or derive_title(task_id)

    bootstrap(repo_root, task_dir, task_id, title, args.force)
    print(f"[OK] Created task artifacts in {task_dir}")
    print(f"[OK] task_id={task_id}")
    print(f"[OK] title={title}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
