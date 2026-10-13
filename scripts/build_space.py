"""ARGUS Phase 5.3 -- stage exactly the files the Hugging Face Space
Docker build needs into build/space/ (gitignored via the repo's
existing blanket `build/` rule), nothing more: no dev files, no
argus.db, no backend/data/, no notebooks, no tests.

Run from the repo root:
    uv run python scripts/build_space.py
"""

import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
STAGING_DIR = REPO_ROOT / "build" / "space"
TEN_MB = 10 * 1024 * 1024

_SKIP_NAMES = {"__pycache__", "data", "notebooks", "tests"}


def _ignore_backend_only(_dir_path: str, names: list[str]) -> set[str]:
    return {n for n in names if n in _SKIP_NAMES or n.endswith(".pyc")}


def _copy_tree(src: Path, dst: Path, ignore=None) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore)


def main() -> None:
    if STAGING_DIR.exists():
        shutil.rmtree(STAGING_DIR)
    STAGING_DIR.mkdir(parents=True)

    # backend/ code + trained_models only -- never data/, notebooks/, tests/.
    _copy_tree(REPO_ROOT / "backend", STAGING_DIR / "backend", ignore=_ignore_backend_only)

    # sample_data/ so the Space has something to try the demo with.
    _copy_tree(REPO_ROOT / "sample_data", STAGING_DIR / "sample_data")

    # Project metadata (pins runtime versions; the Dockerfile overrides
    # torch/torchvision to CPU wheels -- see deploy/hf-space/Dockerfile).
    shutil.copy2(REPO_ROOT / "pyproject.toml", STAGING_DIR / "pyproject.toml")
    shutil.copy2(REPO_ROOT / "uv.lock", STAGING_DIR / "uv.lock")

    # Space build files.
    shutil.copy2(REPO_ROOT / "deploy" / "hf-space" / "Dockerfile", STAGING_DIR / "Dockerfile")
    shutil.copy2(REPO_ROOT / "deploy" / "hf-space" / "README.md", STAGING_DIR / "README.md")
    shutil.copy2(REPO_ROOT / "deploy" / "hf-space" / "requirements.txt", STAGING_DIR / "requirements.txt")

    all_files = sorted(p for p in STAGING_DIR.rglob("*") if p.is_file())
    total_bytes = sum(p.stat().st_size for p in all_files)
    over_10mb = [p for p in all_files if p.stat().st_size > TEN_MB]

    print(f"Staged {len(all_files)} files, {total_bytes / (1024 * 1024):.2f} MB total, into {STAGING_DIR}")
    if over_10mb:
        print("Files over 10 MB (git-lfs needed on Hugging Face Spaces):")
        for p in over_10mb:
            print(f"  {p.relative_to(STAGING_DIR)}  ({p.stat().st_size / (1024 * 1024):.2f} MB)")
    else:
        print("No files over 10 MB -- git-lfs is not required for this Space.")


if __name__ == "__main__":
    main()
