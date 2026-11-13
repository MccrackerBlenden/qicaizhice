"""Deterministic finite-grid optimizer for the predefined synthetic finite-grid analysis."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import time
from collections import Counter
from dataclasses import asdict, dataclass
from itertools import product
from pathlib import Path
from typing import Iterable, Iterator

from scenario.contracts import ActionPlan, ScenarioAssumptions
from scenario.engine import ScenarioError, run_scenario, validate_scenario_tables

from .safe_evaluation import score_2022_snapshot


DIMENSIONS = ("profitability", "solvency", "operations", "growth", "cashflow", "research")
VARIABLES = (
    "receivables_collection_rate",
    "inventory_release_rate",
    "selling_expense_reduction_rate",
    "admin_expense_reduction_rate",
    "short_term_debt_to_revenue",
    "long_term_debt_to_revenue",
)
CURRENCY_ROUNDING_TOLERANCE = 0.011


class GridOptimizationError(ValueError):
    """Fail-closed grid configuration or execution error."""


@dataclass(frozen=True)
class DecisionPlan:
    receivables_collection_rate: float = 0.0
    inventory_release_rate: float = 0.0
    selling_expense_reduction_rate: float = 0.0
    admin_expense_reduction_rate: float = 0.0
    short_term_debt_to_revenue: float = 0.0
    long_term_debt_to_revenue: float = 0.0


def file_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_config(path: str | Path) -> dict[str, object]:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if config.get("frozen_before_search") is not True:
        raise GridOptimizationError("search configuration must be frozen before search")
    if tuple(config.get("target_companies", ())) != ("VPM-071", "VPM-101", "VPM-203"):
        raise GridOptimizationError("target company contract changed")
    if config.get("target_year") != 2022 or config.get("prior_year") != 2021:
        raise GridOptimizationError("year contract changed")
    missing = set(VARIABLES).difference(config.get("decision_variables", {}))
    if missing:
        raise GridOptimizationError(f"missing decision variables: {sorted(missing)}")
    raw = math.prod(len(config["decision_variables"][name]["values"]) for name in VARIABLES)
    if raw != config["expected_counts"]["raw_combinations_per_company"]:
        raise GridOptimizationError("raw candidate count differs from frozen contract")
    enumerated = sum(1 for _ in iter_grid(config))
    if enumerated != config["expected_counts"]["enumerated_combinations_per_company_per_case"]:
        raise GridOptimizationError("enumerated candidate count differs from frozen contract")
    expected_total = enumerated * len(config["target_companies"]) * len(config["sensitivity_cases"])
    if expected_total != config["expected_counts"]["all_sensitivity_candidate_evaluations"]:
        raise GridOptimizationError("total candidate count differs from frozen contract")
    if expected_total > config["resource_limits"]["maximum_candidate_evaluations"]:
        raise GridOptimizationError("frozen search exceeds candidate resource limit")
    return config


def iter_grid(config: dict[str, object]) -> Iterator[DecisionPlan]:
    values = [config["decision_variables"][name]["values"] for name in VARIABLES]
    maximum_debt = float(config["constraints"]["maximum_combined_grid_debt_to_revenue"])
    for item in product(*values):
        decision = DecisionPlan(*map(float, item))
        if decision.short_term_debt_to_revenue + decision.long_term_debt_to_revenue <= maximum_debt + 1e-12:
            yield decision


def decision_id(company_id: str, decision: DecisionPlan) -> str:
    values = asdict(decision)
    encoded = "_".join(f"{name}={values[name]:.4f}" for name in VARIABLES)
    return f"{company_id}|{encoded}"


def _case(config: dict[str, object], name: str) -> dict[str, object]:
    matches = [item for item in config["sensitivity_cases"] if item["name"] == name]
    if len(matches) != 1:
        raise GridOptimizationError(f"unknown sensitivity case: {name}")
    return matches[0]


def _assumptions(
    baseline: ScenarioAssumptions,
    case: dict[str, object],
) -> ScenarioAssumptions:
    values = asdict(baseline)
    for name in (
        "collection_cost_rate",
        "inventory_action_cost_rate",
        "expense_change_implementation_cost_rate",
        "debt_financing_fee_rate",
        "short_term_interest_rate",
        "long_term_interest_rate",
    ):
        values[name] = float(case[name])
    return ScenarioAssumptions(**values)


def _realized_action(
    decision: DecisionPlan,
    revenue: float,
    effect_multiplier: float,
) -> ActionPlan:
    return ActionPlan(
        receivables_collection_rate=decision.receivables_collection_rate * effect_multiplier,
        inventory_release_rate=decision.inventory_release_rate * effect_multiplier,
        selling_expense_reduction_rate=decision.selling_expense_reduction_rate * effect_multiplier,
        admin_expense_reduction_rate=decision.admin_expense_reduction_rate * effect_multiplier,
        short_term_debt_proceeds=round(revenue * decision.short_term_debt_to_revenue, 2),
        long_term_debt_proceeds=round(revenue * decision.long_term_debt_to_revenue, 2),
    )


def _precheck(
    decision: DecisionPlan,
    action: ActionPlan,
    assumptions: ScenarioAssumptions,
    config: dict[str, object],
    income: dict[str, object],
    balance: dict[str, object],
) -> tuple[list[str], dict[str, float]]:
    revenue = float(income["revenue"])
    receivables = float(balance["accounts_receivable"])
    inventory = float(balance["inventory"])
    selling = float(income["selling_expense"])
    admin = float(income["general_and_administrative_expense"])
    ar_release = receivables * action.receivables_collection_rate
    inventory_release = inventory * action.inventory_release_rate
    selling_saving = selling * action.selling_expense_reduction_rate
    admin_saving = admin * action.admin_expense_reduction_rate
    borrowed = action.short_term_debt_proceeds + action.long_term_debt_proceeds
    implementation_cost = (
        ar_release * assumptions.collection_cost_rate
        + inventory_release * assumptions.inventory_action_cost_rate
        + (selling_saving + admin_saving) * assumptions.expense_change_implementation_cost_rate
        + borrowed * assumptions.debt_financing_fee_rate
    )
    incremental_interest = (
        action.short_term_debt_proceeds * assumptions.short_term_interest_rate
        + action.long_term_debt_proceeds * assumptions.long_term_interest_rate
    ) * assumptions.new_debt_interest_year_fraction
    total_action_cost = implementation_cost + incremental_interest
    constraints = config["constraints"]
    action_budget = revenue * float(
        constraints["maximum_action_cost_and_incremental_interest_to_revenue"]
    )
    grid_debt_limit = revenue * float(constraints["maximum_combined_grid_debt_to_revenue"])
    m1f1_debt_limit = revenue * float(constraints["m1f1_maximum_new_debt_to_revenue"])
    reasons: list[str] = []
    if decision.short_term_debt_to_revenue + decision.long_term_debt_to_revenue > float(
        constraints["maximum_combined_grid_debt_to_revenue"]
    ) + 1e-12:
        reasons.append("GRID_COMBINED_DEBT_LIMIT")
    if borrowed > m1f1_debt_limit + CURRENCY_ROUNDING_TOLERANCE:
        reasons.append("M1F1_BORROWING_LIMIT")
    if total_action_cost > action_budget + CURRENCY_ROUNDING_TOLERANCE:
        reasons.append("ACTION_CASH_BUDGET")
    maximums = {
        "receivables_collection_rate": assumptions.maximum_receivables_collection_rate,
        "inventory_release_rate": assumptions.maximum_inventory_release_rate,
        "selling_expense_reduction_rate": assumptions.maximum_expense_reduction_rate,
        "admin_expense_reduction_rate": assumptions.maximum_expense_reduction_rate,
    }
    for name, maximum in maximums.items():
        if float(getattr(action, name)) > float(maximum) + 1e-12:
            reasons.append(f"ACTION_BOUND:{name}")
    working_capital_release = ar_release + inventory_release
    grid_debt_headroom = grid_debt_limit - borrowed
    # Debt proceeds are rounded independently to CNY 10K precision by the
    # fixed-parameter scenario engine.  Do not expose a misleading negative headroom when
    # the rate constraint passes and the difference is only that rounding.
    if -CURRENCY_ROUNDING_TOLERANCE <= grid_debt_headroom < 0.0:
        grid_debt_headroom = 0.0
    facts = {
        "revenue": revenue,
        "ar_release": ar_release,
        "inventory_release": inventory_release,
        "working_capital_release": working_capital_release,
        "gross_expense_saving": selling_saving + admin_saving,
        "borrowed_funds": borrowed,
        "implementation_cash_cost": implementation_cost,
        "incremental_interest": incremental_interest,
        "total_action_cost": total_action_cost,
        "net_funds_occupied_before_expense_saving": total_action_cost - working_capital_release - borrowed,
        "action_budget": action_budget,
        "action_budget_headroom": action_budget - total_action_cost,
        "grid_debt_headroom": grid_debt_headroom,
        "m1f1_debt_headroom": m1f1_debt_limit - borrowed,
        "receivables_rate_headroom": assumptions.maximum_receivables_collection_rate - action.receivables_collection_rate,
        "inventory_rate_headroom": assumptions.maximum_inventory_release_rate - action.inventory_release_rate,
        "selling_rate_headroom": assumptions.maximum_expense_reduction_rate - action.selling_expense_reduction_rate,
        "admin_rate_headroom": assumptions.maximum_expense_reduction_rate - action.admin_expense_reduction_rate,
    }
    return sorted(set(reasons)), facts


def _rejection_code(error: ScenarioError) -> str:
    text = str(error)
    if "ending cash" in text and "below minimum" in text:
        return "MINIMUM_CASH"
    if "debt/assets" in text:
        return "DEBT_TO_ASSETS"
    if "interest coverage" in text:
        return "INTEREST_COVERAGE"
    if "financial linkage failed" in text:
        return "ACCOUNTING_LINKAGE"
    if "exceeds configured maximum" in text or "action values" in text:
        return "ACTION_BOUND"
    if "new debt exceeds" in text:
        return "M1F1_BORROWING_LIMIT"
    return "SCENARIO_ERROR"


def evaluate_candidate(
    *,
    company_id: str,
    decision: DecisionPlan,
    case_name: str,
    config: dict[str, object],
    baseline_assumptions: ScenarioAssumptions,
    tables: dict[str, dict[tuple[str, int], dict[str, object]]],
    frozen_model: dict[str, object],
) -> tuple[dict[str, object], dict[str, object] | None]:
    key = (company_id, 2022)
    income = tables["income_statement"][key]
    balance = tables["balance_sheet"][key]
    revenue = float(income["revenue"])
    case = _case(config, case_name)
    assumptions = _assumptions(baseline_assumptions, case)
    action = _realized_action(decision, revenue, float(case["effect_multiplier"]))
    reasons, facts = _precheck(decision, action, assumptions, config, income, balance)
    row: dict[str, object] = {
        "label": config["label"],
        "company_id": company_id,
        "case": case_name,
        "decision_id": decision_id(company_id, decision),
        **asdict(decision),
        "effect_multiplier": float(case["effect_multiplier"]),
        **facts,
        "feasible": False,
        "rejection_reason": ";".join(reasons),
        "constraint_checks_complete": False,
        "accounting_checks_passed": 0,
        "accounting_checks_total": int(config["constraints"]["accounting_check_count"]),
        "accounting_max_abs_residual": "",
        "overall_before": "",
        "overall_after": "",
        "score_delta": "",
        "ending_cash": "",
        "minimum_cash": revenue * float(config["constraints"]["minimum_cash_to_revenue"]),
        "cash_headroom": "",
        "debt_to_assets": "",
        "debt_to_assets_headroom": "",
        "interest_coverage": "",
        "interest_coverage_headroom": "",
    }
    if reasons:
        return row, None
    try:
        detail = run_scenario(
            tables,
            company_id,
            action,
            assumptions,
            frozen_model,
            year=2022,
        )
    except ScenarioError as exc:
        row["rejection_reason"] = f"{_rejection_code(exc)}:{exc}"
        return row, None
    checks = detail["financial_checks"]
    maximum_residual = max(abs(float(item["residual"])) for item in checks)
    if len(checks) != int(config["constraints"]["accounting_check_count"]):
        raise GridOptimizationError("unexpected accounting check count")
    if any(not item["passed"] for item in checks):
        raise GridOptimizationError("scenario engine accepted a failed accounting linkage")
    before, after = detail["baseline_score"], detail["scenario_score"]
    ending_cash = float(detail["constraints"]["ending_cash"])
    minimum_cash = float(detail["constraints"]["minimum_cash"])
    debt_to_assets = float(detail["constraints"]["debt_to_assets"])
    interest_coverage = float(detail["constraints"]["interest_coverage"])
    row.update(
        {
            "feasible": True,
            "rejection_reason": "",
            "constraint_checks_complete": True,
            "accounting_checks_passed": sum(bool(item["passed"]) for item in checks),
            "accounting_checks_total": len(checks),
            "accounting_max_abs_residual": maximum_residual,
            "overall_before": float(before["overall_score"]),
            "overall_after": float(after["overall_score"]),
            "score_delta": float(detail["score_delta"]),
            "ending_cash": ending_cash,
            "minimum_cash": minimum_cash,
            "cash_headroom": ending_cash - minimum_cash,
            "debt_to_assets": debt_to_assets,
            "debt_to_assets_headroom": float(config["constraints"]["maximum_interest_bearing_debt_to_assets"]) - debt_to_assets,
            "interest_coverage": interest_coverage,
            "interest_coverage_headroom": interest_coverage - float(config["constraints"]["minimum_interest_coverage"]),
        }
    )
    for dimension in DIMENSIONS:
        row[f"{dimension}_delta"] = float(after[f"score_{dimension}"]) - float(
            before[f"score_{dimension}"]
        )
    return row, detail


def search(
    *,
    config: dict[str, object],
    baseline_assumptions: ScenarioAssumptions,
    tables: dict[str, dict[tuple[str, int], dict[str, object]]],
    frozen_model: dict[str, object],
    companies: Iterable[str] | None = None,
    cases: Iterable[str] | None = None,
    plans: Iterable[DecisionPlan] | None = None,
    retain_details: bool = True,
) -> tuple[list[dict[str, object]], dict[tuple[str, str, str], dict[str, object]]]:
    company_ids = tuple(companies or config["target_companies"])
    case_names = tuple(cases or (item["name"] for item in config["sensitivity_cases"]))
    frozen_plans = tuple(plans) if plans is not None else tuple(iter_grid(config))
    maximum = int(config["resource_limits"]["maximum_candidate_evaluations"])
    expected = len(company_ids) * len(case_names) * len(frozen_plans)
    if expected > maximum:
        raise GridOptimizationError(f"requested {expected} evaluations exceeds resource limit {maximum}")
    start = time.monotonic()
    elapsed_limit = float(config["resource_limits"]["maximum_elapsed_seconds"])
    rows: list[dict[str, object]] = []
    details: dict[tuple[str, str, str], dict[str, object]] = {}
    for case_name in case_names:
        for company_id in company_ids:
            for decision in frozen_plans:
                if time.monotonic() - start > elapsed_limit:
                    raise GridOptimizationError("elapsed-time resource limit exceeded")
                row, detail = evaluate_candidate(
                    company_id=company_id,
                    decision=decision,
                    case_name=case_name,
                    config=config,
                    baseline_assumptions=baseline_assumptions,
                    tables=tables,
                    frozen_model=frozen_model,
                )
                rows.append(row)
                if detail is not None and retain_details:
                    details[(case_name, company_id, str(row["decision_id"]))] = detail
    return rows, details


def best_candidate(rows: list[dict[str, object]]) -> dict[str, object] | None:
    feasible = [row for row in rows if row["feasible"]]
    if not feasible:
        return None
    return min(
        feasible,
        key=lambda row: (
            -float(row["score_delta"]),
            float(row["total_action_cost"]),
            str(row["decision_id"]),
        ),
    )


def low_cost_improving_candidate(
    rows: list[dict[str, object]], minimum_improvement: float = 1e-12
) -> dict[str, object] | None:
    candidates = [
        row
        for row in rows
        if row["feasible"] and float(row["score_delta"]) > minimum_improvement
    ]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda row: (
            float(row["total_action_cost"]),
            -float(row["score_delta"]),
            str(row["decision_id"]),
        ),
    )


def pareto_front(
    rows: list[dict[str, object]], minimum_improvement: float = 1e-12
) -> list[dict[str, object]]:
    candidates = [
        row
        for row in rows
        if row["feasible"] and float(row["score_delta"]) > minimum_improvement
    ]
    candidates.sort(
        key=lambda row: (
            float(row["total_action_cost"]),
            -float(row["score_delta"]),
            str(row["decision_id"]),
        )
    )
    frontier: list[dict[str, object]] = []
    best_delta = float("-inf")
    for row in candidates:
        delta = float(row["score_delta"])
        if delta > best_delta + 1e-12:
            frontier.append(row)
            best_delta = delta
    return frontier


def baseline_reference(
    company_id: str,
    tables: dict[str, dict[tuple[str, int], dict[str, object]]],
    frozen_model: dict[str, object],
    config: dict[str, object],
) -> dict[str, object]:
    metric, score = score_2022_snapshot(tables, company_id, frozen_model)
    key = (company_id, 2022)
    income = tables["income_statement"][key]
    balance = tables["balance_sheet"][key]
    revenue = float(income["revenue"])
    cash = float(balance["cash_and_cash_equivalents"])
    debt = float(balance["short_term_debt"]) + float(balance["long_term_debt"])
    assets = float(balance["total_assets"])
    operating_income = float(income["operating_income"])
    interest = float(income["interest_expense"])
    coverage = operating_income / interest if interest > 0 else float("inf")
    checks = validate_scenario_tables(tables, company_id, 2022)
    minimum_cash = revenue * float(config["constraints"]["minimum_cash_to_revenue"])
    leverage = debt / assets
    feasible = (
        cash + 0.011 >= minimum_cash
        and leverage <= float(config["constraints"]["maximum_interest_bearing_debt_to_assets"]) + 1e-12
        and coverage + 1e-12 >= float(config["constraints"]["minimum_interest_coverage"])
        and all(item["passed"] for item in checks)
    )
    return {
        "label": "零行动基线（比较参照）",
        "company_id": company_id,
        "case": "baseline",
        "decision_id": decision_id(company_id, DecisionPlan()),
        **asdict(DecisionPlan()),
        "feasible_under_action_constraints": feasible,
        "overall_before": float(score["overall_score"]),
        "overall_after": float(score["overall_score"]),
        "score_delta": 0.0,
        "ending_cash": cash,
        "minimum_cash": minimum_cash,
        "cash_headroom": cash - minimum_cash,
        "debt_to_assets": leverage,
        "debt_to_assets_headroom": float(config["constraints"]["maximum_interest_bearing_debt_to_assets"]) - leverage,
        "interest_coverage": coverage,
        "interest_coverage_headroom": coverage - float(config["constraints"]["minimum_interest_coverage"]),
        "working_capital_release": 0.0,
        "borrowed_funds": 0.0,
        "implementation_cash_cost": 0.0,
        "incremental_interest": 0.0,
        "total_action_cost": 0.0,
        "net_funds_occupied_before_expense_saving": 0.0,
        "accounting_checks_passed": sum(bool(item["passed"]) for item in checks),
        "accounting_checks_total": len(checks),
        "accounting_max_abs_residual": max(abs(float(item["residual"])) for item in checks),
        "baseline_metrics": metric,
        "baseline_score": score,
        "baseline_statements": {name: copy.deepcopy(table[key]) for name, table in tables.items()},
    }


def summarize_rejections(rows: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    counts: Counter[tuple[str, str, str]] = Counter()
    for row in rows:
        reason = str(row.get("rejection_reason", ""))
        code = reason.split(":", 1)[0] if reason else "FEASIBLE"
        counts[(str(row["case"]), str(row["company_id"]), code)] += 1
    return [
        {"case": case, "company_id": company, "outcome": outcome, "count": count}
        for (case, company, outcome), count in sorted(counts.items())
    ]
