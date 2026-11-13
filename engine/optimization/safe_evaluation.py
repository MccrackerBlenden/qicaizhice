"""In-memory adapter for the fixed-parameter financial metric and evaluation calculations.

This module deliberately exposes no file loader.  Callers must supply the
three-table mapping returned by :mod:`optimization.safe_input`.
"""

from __future__ import annotations

from evaluation.core import PanelRow, score_rows
from finance_metrics.calculator import calculate_panel


class SafeEvaluationError(ValueError):
    """The safe in-memory evaluation contract was violated."""


def score_2022_snapshot(
    tables: dict[str, dict[tuple[str, int], dict[str, object]]],
    company_id: str,
    frozen_model: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    """Calculate financial metrics and evaluation score for exactly one 2022 row."""
    allowed_keys = {(company_id, 2021), (company_id, 2022)}
    for table_name, rows in tables.items():
        company_keys = {key for key in rows if key[0] == company_id}
        if company_keys != allowed_keys:
            raise SafeEvaluationError(
                f"{table_name} must contain exactly 2021/2022 for {company_id}"
            )
    candidates = [
        row
        for row in calculate_panel(tables, target_years=(2022,))
        if row["company_id"] == company_id and row["fiscal_year"] == 2022
    ]
    if len(candidates) != 1:
        raise SafeEvaluationError(
            f"expected one 2022 metric row for {company_id}, got {len(candidates)}"
        )
    metric = candidates[0]
    active = list(frozen_model["active_indicators"])
    panel_row = PanelRow(
        company_id=company_id,
        company_name=str(metric["company_name"]),
        archetype=str(metric["archetype"]),
        fiscal_year=2022,
        information_cutoff_year=2022,
        split_role="m1f2_static_hypothetical_optimization",
        values={
            code: None if metric[code] is None else float(metric[code])
            for code in active
        },
        missing_reasons={
            code: str(metric[f"{code}__missing_reason"]) for code in active
        },
    )
    score = score_rows([panel_row], frozen_model, add_positions=False)[0]
    return metric, score
