from __future__ import annotations

import copy
import json
from dataclasses import asdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

from evaluation.core import PanelRow, score_rows
from finance_metrics.calculator import calculate_panel

from .contracts import ActionPlan, ScenarioAssumptions

D = Decimal
CENT = D("0.01")


class ScenarioError(ValueError):
    """Rejected or internally inconsistent hypothetical plan."""


def _d(value: object) -> Decimal:
    return D(str(value))


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _set(row: dict[str, object], field: str, value: Decimal) -> None:
    row[field] = f"{_q(value):.2f}"


def _get(row: dict[str, object], field: str) -> Decimal:
    try:
        return _d(row[field])
    except (KeyError, ValueError) as exc:
        raise ScenarioError(f"missing/invalid baseline field: {field}") from exc


def _validate_plan(plan: ActionPlan, a: ScenarioAssumptions, revenue: Decimal) -> None:
    fields = asdict(plan)
    if any(not isinstance(value, (int, float)) for value in fields.values()):
        raise ScenarioError("all action values must be numeric")
    if any(value < 0 for value in fields.values()):
        raise ScenarioError("action values cannot be negative")
    bounded = {
        "receivables_collection_rate": a.maximum_receivables_collection_rate,
        "inventory_release_rate": a.maximum_inventory_release_rate,
        "selling_expense_reduction_rate": a.maximum_expense_reduction_rate,
        "admin_expense_reduction_rate": a.maximum_expense_reduction_rate,
    }
    for name, maximum in bounded.items():
        if getattr(plan, name) > maximum:
            raise ScenarioError(f"{name} exceeds configured maximum {maximum}")
    new_debt = _d(plan.short_term_debt_proceeds + plan.long_term_debt_proceeds)
    if new_debt > revenue * _d(a.maximum_new_debt_to_revenue):
        raise ScenarioError("new debt exceeds maximum_new_debt_to_revenue")
    if _d(plan.incremental_rd_expense) > revenue * _d(a.maximum_incremental_rd_to_revenue):
        raise ScenarioError("incremental R&D exceeds maximum_incremental_rd_to_revenue")
    if _d(plan.capital_expenditure) > revenue * _d(a.maximum_capex_to_revenue):
        raise ScenarioError("capital expenditure exceeds maximum_capex_to_revenue")


def _tax_effect(baseline_pbt: Decimal, scenario_pbt: Decimal, tax_rate: Decimal) -> tuple[Decimal, Decimal]:
    baseline_tax = max(baseline_pbt, D("0")) * tax_rate
    scenario_tax = max(scenario_pbt, D("0")) * tax_rate
    return _q(scenario_tax), _q(scenario_tax - baseline_tax)


def _financial_checks(tables: dict[str, dict[tuple[str, int], dict[str, object]]], key: tuple[str, int]) -> list[dict[str, Any]]:
    inc = tables["income_statement"][key]
    bal = tables["balance_sheet"][key]
    cf = tables["cash_flow_statement"][key]
    checks = {
        "gross_profit": _get(inc, "revenue") - _get(inc, "cost_of_goods_sold") - _get(inc, "gross_profit"),
        "operating_income": _get(inc, "gross_profit") - _get(inc, "research_and_development") - _get(inc, "selling_expense") - _get(inc, "general_and_administrative_expense") - _get(inc, "depreciation_and_amortization") - _get(inc, "operating_income"),
        "income_before_tax": _get(inc, "operating_income") + _get(inc, "other_income") - _get(inc, "interest_expense") - _get(inc, "income_before_tax"),
        "net_income": _get(inc, "income_before_tax") - _get(inc, "income_tax_expense") - _get(inc, "net_income"),
        "current_assets": _get(bal, "cash_and_cash_equivalents") + _get(bal, "accounts_receivable") + _get(bal, "inventory") + _get(bal, "other_current_assets") - _get(bal, "total_current_assets"),
        "total_assets": _get(bal, "total_current_assets") + _get(bal, "property_plant_equipment_net") - _get(bal, "total_assets"),
        "current_liabilities": _get(bal, "accounts_payable") + _get(bal, "accrued_liabilities") + _get(bal, "short_term_debt") - _get(bal, "total_current_liabilities"),
        "total_liabilities": _get(bal, "total_current_liabilities") + _get(bal, "other_operating_liabilities") + _get(bal, "long_term_debt") - _get(bal, "total_liabilities"),
        "equity": _get(bal, "share_capital") + _get(bal, "retained_earnings") - _get(bal, "total_equity"),
        "accounting_equation": _get(bal, "total_assets") - _get(bal, "total_liabilities_and_equity"),
        "liabilities_and_equity": _get(bal, "total_liabilities") + _get(bal, "total_equity") - _get(bal, "total_liabilities_and_equity"),
        "cfo": _get(cf, "net_income") + _get(cf, "depreciation_and_amortization") - _get(cf, "increase_in_accounts_receivable") - _get(cf, "increase_in_inventory") - _get(cf, "increase_in_other_current_assets") + _get(cf, "increase_in_accounts_payable") + _get(cf, "increase_in_accrued_liabilities") + _get(cf, "increase_in_other_operating_liabilities") - _get(cf, "net_cash_from_operating_activities"),
        "cfi": -_get(cf, "capital_expenditures") - _get(cf, "net_cash_from_investing_activities"),
        "cash_change": _get(cf, "net_cash_from_operating_activities") + _get(cf, "net_cash_from_investing_activities") + _get(cf, "net_cash_from_financing_activities") - _get(cf, "net_change_in_cash"),
        "ending_cash": _get(cf, "beginning_cash") + _get(cf, "net_change_in_cash") - _get(cf, "ending_cash"),
        "cash_to_balance": _get(cf, "ending_cash") - _get(bal, "cash_and_cash_equivalents"),
        "retained_earnings_bridge": _get(cf, "beginning_retained_earnings") + _get(inc, "net_income") - _get(cf, "dividends_paid") - _get(bal, "retained_earnings"),
    }
    return [{"check": name, "residual": float(_q(value)), "passed": abs(value) <= CENT} for name, value in checks.items()]


def _metrics_and_score(tables: dict[str, dict[tuple[str, int], dict[str, object]]], company_id: str, year: int, frozen_model: dict[str, object]) -> tuple[dict[str, object], dict[str, object]]:
    candidates = [row for row in calculate_panel(tables, target_years=(year,)) if row["company_id"] == company_id]
    if len(candidates) != 1:
        raise ScenarioError(f"expected one metric row for {company_id}/{year}, got {len(candidates)}")
    metric = candidates[0]
    active = list(frozen_model["active_indicators"])
    row = PanelRow(
        company_id=company_id,
        company_name=str(metric["company_name"]),
        archetype=str(metric["archetype"]),
        fiscal_year=year,
        information_cutoff_year=year,
        split_role="hypothetical_financial_scenario",
        values={code: (None if metric[code] is None else float(metric[code])) for code in active},
        missing_reasons={code: str(metric[f"{code}__missing_reason"]) for code in active},
    )
    score = score_rows([row], frozen_model, add_positions=False)[0]
    return metric, score


def run_scenario(
    baseline_tables: dict[str, dict[tuple[str, int], dict[str, object]]],
    company_id: str,
    plan: ActionPlan,
    assumptions: ScenarioAssumptions,
    frozen_model: dict[str, object],
    *,
    year: int = 2022,
) -> dict[str, object]:
    if year != 2022:
        raise ScenarioError("Scenario calculation permits only the 2022 synthetic baseline")
    assumptions.validate()
    key = (company_id, year)
    prior_key = (company_id, year - 1)
    for table in baseline_tables.values():
        if key not in table or prior_key not in table:
            raise ScenarioError(f"missing 2021/2022 baseline for {company_id}")
    scenario = copy.deepcopy(baseline_tables)
    inc, bal, cf = (scenario[name][key] for name in ("income_statement", "balance_sheet", "cash_flow_statement"))
    revenue = _get(inc, "revenue")
    _validate_plan(plan, assumptions, revenue)
    baseline_metric, baseline_score = _metrics_and_score(baseline_tables, company_id, year, frozen_model)

    ar_release = _q(_get(bal, "accounts_receivable") * _d(plan.receivables_collection_rate))
    inventory_release = _q(_get(bal, "inventory") * _d(plan.inventory_release_rate))
    selling_saving = _q(_get(inc, "selling_expense") * _d(plan.selling_expense_reduction_rate))
    admin_saving = _q(_get(inc, "general_and_administrative_expense") * _d(plan.admin_expense_reduction_rate))
    collection_cost = _q(ar_release * _d(assumptions.collection_cost_rate))
    inventory_cost = _q(inventory_release * _d(assumptions.inventory_action_cost_rate))
    implementation_cost = _q((selling_saving + admin_saving) * _d(assumptions.expense_change_implementation_cost_rate))
    new_st = _q(_d(plan.short_term_debt_proceeds))
    new_lt = _q(_d(plan.long_term_debt_proceeds))
    financing_fee = _q((new_st + new_lt) * _d(assumptions.debt_financing_fee_rate))
    incremental_interest = _q((new_st * _d(assumptions.short_term_interest_rate) + new_lt * _d(assumptions.long_term_interest_rate)) * _d(assumptions.new_debt_interest_year_fraction))
    capex = _q(_d(plan.capital_expenditure))
    incremental_depreciation = _q(capex * _d(assumptions.capex_current_year_depreciation_rate))
    extra_rd = _q(_d(plan.incremental_rd_expense))

    _set(inc, "research_and_development", _get(inc, "research_and_development") + extra_rd)
    _set(inc, "selling_expense", _get(inc, "selling_expense") - selling_saving + collection_cost + inventory_cost + implementation_cost + financing_fee)
    _set(inc, "general_and_administrative_expense", _get(inc, "general_and_administrative_expense") - admin_saving)
    _set(inc, "depreciation_and_amortization", _get(inc, "depreciation_and_amortization") + incremental_depreciation)
    operating_income = _get(inc, "gross_profit") - _get(inc, "research_and_development") - _get(inc, "selling_expense") - _get(inc, "general_and_administrative_expense") - _get(inc, "depreciation_and_amortization")
    _set(inc, "operating_income", operating_income)
    _set(inc, "interest_expense", _get(inc, "interest_expense") + incremental_interest)
    pbt = operating_income + _get(inc, "other_income") - _get(inc, "interest_expense")
    _set(inc, "income_before_tax", pbt)
    tax, tax_delta = _tax_effect(_get(baseline_tables["income_statement"][key], "income_before_tax"), pbt, _get(inc, "tax_rate"))
    _set(inc, "income_tax_expense", tax)
    _set(inc, "net_income", pbt - tax)
    net_income_delta = _get(inc, "net_income") - _get(baseline_tables["income_statement"][key], "net_income")

    _set(bal, "accounts_receivable", _get(bal, "accounts_receivable") - ar_release)
    _set(bal, "inventory", _get(bal, "inventory") - inventory_release)
    _set(bal, "property_plant_equipment_net", _get(bal, "property_plant_equipment_net") + capex - incremental_depreciation)
    _set(bal, "short_term_debt", _get(bal, "short_term_debt") + new_st)
    _set(bal, "long_term_debt", _get(bal, "long_term_debt") + new_lt)
    _set(bal, "retained_earnings", _get(bal, "retained_earnings") + net_income_delta)

    _set(cf, "net_income", _get(inc, "net_income"))
    _set(cf, "depreciation_and_amortization", _get(inc, "depreciation_and_amortization"))
    _set(cf, "increase_in_accounts_receivable", _get(cf, "increase_in_accounts_receivable") - ar_release)
    _set(cf, "increase_in_inventory", _get(cf, "increase_in_inventory") - inventory_release)
    cfo = _get(cf, "net_income") + _get(cf, "depreciation_and_amortization") - _get(cf, "increase_in_accounts_receivable") - _get(cf, "increase_in_inventory") - _get(cf, "increase_in_other_current_assets") + _get(cf, "increase_in_accounts_payable") + _get(cf, "increase_in_accrued_liabilities") + _get(cf, "increase_in_other_operating_liabilities")
    _set(cf, "net_cash_from_operating_activities", cfo)
    _set(cf, "capital_expenditures", _get(cf, "capital_expenditures") + capex)
    _set(cf, "net_cash_from_investing_activities", -_get(cf, "capital_expenditures"))
    _set(cf, "short_term_debt_proceeds", _get(cf, "short_term_debt_proceeds") + new_st)
    _set(cf, "long_term_debt_proceeds", _get(cf, "long_term_debt_proceeds") + new_lt)
    financing = _get(cf, "planned_equity_issuance") + _get(cf, "emergency_equity_issuance") + _get(cf, "short_term_debt_proceeds") + _get(cf, "long_term_debt_proceeds") - _get(cf, "short_term_debt_repayment") - _get(cf, "long_term_debt_repayment") - _get(cf, "dividends_paid")
    _set(cf, "net_cash_from_financing_activities", financing)
    cash_change = cfo + _get(cf, "net_cash_from_investing_activities") + financing
    _set(cf, "net_change_in_cash", cash_change)
    ending_cash = _get(cf, "beginning_cash") + cash_change
    _set(cf, "ending_cash", ending_cash)
    _set(bal, "cash_and_cash_equivalents", ending_cash)

    _set(bal, "total_current_assets", _get(bal, "cash_and_cash_equivalents") + _get(bal, "accounts_receivable") + _get(bal, "inventory") + _get(bal, "other_current_assets"))
    _set(bal, "total_assets", _get(bal, "total_current_assets") + _get(bal, "property_plant_equipment_net"))
    _set(bal, "total_current_liabilities", _get(bal, "accounts_payable") + _get(bal, "accrued_liabilities") + _get(bal, "short_term_debt"))
    _set(bal, "total_liabilities", _get(bal, "total_current_liabilities") + _get(bal, "other_operating_liabilities") + _get(bal, "long_term_debt"))
    _set(bal, "total_equity", _get(bal, "share_capital") + _get(bal, "retained_earnings"))
    _set(bal, "total_liabilities_and_equity", _get(bal, "total_liabilities") + _get(bal, "total_equity"))
    _set(cf, "ending_property_plant_equipment_net", _get(bal, "property_plant_equipment_net"))
    _set(cf, "ending_short_term_debt", _get(bal, "short_term_debt"))
    _set(cf, "ending_long_term_debt", _get(bal, "long_term_debt"))
    _set(cf, "ending_retained_earnings", _get(bal, "retained_earnings"))

    checks = _financial_checks(scenario, key)
    failures = [item for item in checks if not item["passed"]]
    if failures:
        raise ScenarioError(f"financial linkage failed: {failures}")
    minimum_cash = revenue * _d(assumptions.minimum_cash_ratio_to_revenue)
    debt = _get(bal, "short_term_debt") + _get(bal, "long_term_debt")
    leverage = debt / _get(bal, "total_assets")
    interest_coverage = operating_income / _get(inc, "interest_expense") if _get(inc, "interest_expense") > 0 else D("Infinity")
    constraint_failures = []
    if ending_cash < minimum_cash:
        constraint_failures.append(f"ending cash {ending_cash} below minimum {minimum_cash:.2f}")
    if leverage > _d(assumptions.maximum_debt_to_assets):
        constraint_failures.append(f"debt/assets {leverage:.4f} exceeds {assumptions.maximum_debt_to_assets}")
    if interest_coverage < _d(assumptions.minimum_interest_coverage):
        constraint_failures.append(f"interest coverage {interest_coverage:.4f} below {assumptions.minimum_interest_coverage}")
    if constraint_failures:
        raise ScenarioError("; ".join(constraint_failures))

    scenario_metric, scenario_score = _metrics_and_score(scenario, company_id, year, frozen_model)
    return {
        "label": "假设财务方案",
        "disclaimer": "静态反事实，不是2023真实数据、预测报表或已验证因果收益。",
        "company_id": company_id,
        "year": year,
        "plan": asdict(plan),
        "assumptions": asdict(assumptions),
        "effects": {"ar_release": float(ar_release), "inventory_release": float(inventory_release), "action_cost": float(collection_cost + inventory_cost + implementation_cost + financing_fee), "incremental_interest": float(incremental_interest), "tax_delta": float(tax_delta), "net_income_delta": float(net_income_delta)},
        "baseline_statements": {name: baseline_tables[name][key] for name in baseline_tables},
        "scenario_statements": {name: scenario[name][key] for name in scenario},
        "baseline_metrics": baseline_metric,
        "scenario_metrics": scenario_metric,
        "baseline_score": baseline_score,
        "scenario_score": scenario_score,
        "score_delta": float(scenario_score["overall_score"]) - float(baseline_score["overall_score"]),
        "financial_checks": checks,
        "constraints": {"minimum_cash": float(minimum_cash), "ending_cash": float(ending_cash), "debt_to_assets": float(leverage), "interest_coverage": float(interest_coverage), "passed": True},
        "lag_uncertainty": "资本开支与研发仅计当期现金、费用/折旧和税效应；未来收入、效率或研发成果均未建模。",
    }


def load_frozen_model(path: str | Path) -> dict[str, object]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_scenario_tables(tables: dict[str, dict[tuple[str, int], dict[str, object]]], company_id: str, year: int = 2022) -> list[dict[str, Any]]:
    """Public reverse-injection validator; it never repairs inconsistent statements."""
    return _financial_checks(tables, (company_id, year))
