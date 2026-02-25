---
paths:
  - "**/*.py"
---

# Python Conventions

- Use type hints on all function signatures; avoid `Any` unless wrapping truly dynamic APIs
- Use `ruff` for linting and formatting (replaces black, isort, flake8)
- Prefer `pathlib.Path` over `os.path` for filesystem operations
- Use `dataclasses` for simple data containers; use `pydantic` when validation is needed
- Prefer f-strings over `.format()` or `%` formatting
- Use `from __future__ import annotations` for deferred evaluation of type hints
- Prefer `enum.Enum` or `typing.Literal` for fixed sets of values
- Use context managers (`with` statements) for resource management
- Prefer list/dict/set comprehensions over `map`/`filter` when readable
- Use `logging` module instead of `print` for operational output
- Prefer `pytest` for testing; use fixtures over setUp/tearDown
- Use `uv` as the package manager when available
