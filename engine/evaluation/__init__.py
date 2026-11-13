"""Independent synthetic financial evaluation module."""

from .core import (
    EvaluationError,
    fit_model,
    load_indicator_specs,
    load_panel,
    score_rows,
)

__all__ = [
    "EvaluationError",
    "fit_model",
    "load_indicator_specs",
    "load_panel",
    "score_rows",
]

