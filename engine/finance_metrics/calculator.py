"""Pure, deterministic indicator calculations over fixed-parameter synthetic financial statements."""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable

from .definitions import METRICS

Key = tuple[str, int]
Tables = dict[str, dict[Key, dict[str, object]]]


class BaselineError(ValueError):
    """Raised when the frozen statement baseline is incomplete or inconsistent."""


def _parse_row(row: dict[str, str]) -> dict[str, object]:
    parsed: dict[str, object] = dict(row)
    for field in ("fiscal_year", "information_cutoff_year"):
        try:
            parsed[field] = int(row[field])
        except (KeyError, TypeError, ValueError) as exc:
            raise BaselineError(f"invalid {field}: {row.get(field)!r}") from exc
    return parsed


def load_statement_tables(data_dir: str | Path, *, strict: bool = True) -> Tables:
    root = Path(data_dir)
    tables: Tables = {}
    for table in ("income_statement", "balance_sheet", "cash_flow_statement"):
        path = root / f"{table}.csv"
        if not path.is_file():
            raise BaselineError(f"missing statement file: {path}")
        indexed: dict[Key, dict[str, object]] = {}
        with path.open("r", encoding="utf-8", newline="") as handle:
            for raw in csv.DictReader(handle):
                row = _parse_row(raw)
                key = (str(row.get("company_id", "")), int(row["fiscal_year"]))
                if not key[0]:
                    raise BaselineError(f"missing company_id in {table}")
                if key in indexed:
                    raise BaselineError(f"duplicate key in {table}: {key}")
                if row["information_cutoff_year"] != key[1]:
                    raise BaselineError(f"future/stale cutoff in {table}: {key}")
                indexed[key] = row
        tables[table] = indexed

    if strict:
        key_sets = {name: set(rows) for name, rows in tables.items()}
        if len({frozenset(keys) for keys in key_sets.values()}) != 1:
            raise BaselineError("statement key sets do not match")
        keys = next(iter(key_sets.values()))
        companies = {company_id for company_id, _ in keys}
        if len(companies) != 328 or len(keys) != 1640:
            raise BaselineError(f"expected 328 companies and 1640 keys, got {len(companies)} and {len(keys)}")
        for company_id in companies:
            years = {year for cid, year in keys if cid == company_id}
            if years != {2019, 2020, 2021, 2022, 2023}:
                raise BaselineError(f"non-continuous years for {company_id}: {sorted(years)}")
        for key in keys:
            metadata = {
                tuple(tables[name][key].get(field) for field in ("company_name", "archetype", "currency", "amount_unit"))
                for name in tables
            }
            if len(metadata) != 1:
                raise BaselineError(f"statement metadata mismatch: {key}")
    return tables


def _decimal(row: dict[str, object] | None, table: str, field: str) -> tuple[Decimal | None, str]:
    if row is None:
        return None, f"MISSING_STATEMENT:{table}"
    value = row.get(field)
    if value in (None, ""):
        return None, f"MISSING_FIELD:{table}.{field}"
    try:
        return Decimal(str(value)), ""
    except (InvalidOperation, ValueError):
        return None, f"INVALID_VALUE:{table}.{field}"


def _ratio(numerator: Decimal | None, denominator: Decimal | None, reason: str, denominator_name: str, *, positive: bool = False) -> tuple[Decimal | None, str]:
    if reason:
        return None, reason
    assert numerator is not None and denominator is not None
    if positive and denominator <= 0:
        return None, f"NON_POSITIVE_DENOMINATOR:{denominator_name}"
    if denominator == 0:
        return None, f"ZERO_DENOMINATOR:{denominator_name}"
    return numerator / denominator, ""


def _pair(row: dict[str, object] | None, table: str, left: str, right: str) -> tuple[Decimal | None, Decimal | None, str]:
    a, reason = _decimal(row, table, left)
    if reason:
        return None, None, reason
    b, reason = _decimal(row, table, right)
    return a, b, reason


def _current_ratio(table: str, row: dict[str, object] | None, numerator_field: str, denominator_field: str, *, positive: bool = False) -> tuple[Decimal | None, str]:
    numerator, denominator, reason = _pair(row, table, numerator_field, denominator_field)
    return _ratio(numerator, denominator, reason, denominator_field, positive=positive)


def _average(current: dict[str, object] | None, prior: dict[str, object] | None, table: str, field: str) -> tuple[Decimal | None, str]:
    if prior is None:
        return None, f"MISSING_PRIOR_YEAR:{table}"
    current_value, reason = _decimal(current, table, field)
    if reason:
        return None, reason
    prior_value, reason = _decimal(prior, table, field)
    if reason:
        return None, f"MISSING_PRIOR_FIELD:{table}.{field}"
    assert current_value is not None and prior_value is not None
    return (current_value + prior_value) / Decimal("2"), ""


def _growth(current: dict[str, object] | None, prior: dict[str, object] | None, table: str, field: str) -> tuple[Decimal | None, str]:
    if prior is None:
        return None, f"MISSING_PRIOR_YEAR:{table}"
    current_value, reason = _decimal(current, table, field)
    if reason:
        return None, reason
    prior_value, reason = _decimal(prior, table, field)
    if reason:
        return None, f"MISSING_PRIOR_FIELD:{table}.{field}"
    assert current_value is not None and prior_value is not None
    return _ratio(current_value - prior_value, abs(prior_value), "", f"prior_{field}")


def calculate_metric(code: str, current: dict[str, dict[str, object] | None], prior: dict[str, dict[str, object] | None]) -> tuple[Decimal | None, str]:
    inc, bal, cash = current["income_statement"], current["balance_sheet"], current["cash_flow_statement"]
    pinc, pbal = prior["income_statement"], prior["balance_sheet"]

    direct = {
        "gross_margin": ("income_statement", inc, "gross_profit", "revenue", False),
        "operating_margin": ("income_statement", inc, "operating_income", "revenue", False),
        "net_margin": ("income_statement", inc, "net_income", "revenue", False),
        "current_ratio": ("balance_sheet", bal, "total_current_assets", "total_current_liabilities", False),
        "liabilities_to_assets": ("balance_sheet", bal, "total_liabilities", "total_assets", False),
        "interest_coverage": ("income_statement", inc, "operating_income", "interest_expense", True),
        "liabilities_to_equity": ("balance_sheet", bal, "total_liabilities", "total_equity", True),
        "cash_to_assets": ("balance_sheet", bal, "cash_and_cash_equivalents", "total_assets", False),
        "rd_intensity": ("income_statement", inc, "research_and_development", "revenue", False),
        "rd_to_gross_profit": ("income_statement", inc, "research_and_development", "gross_profit", True),
    }
    if code in direct:
        table, row, num, den, positive = direct[code]
        return _current_ratio(table, row, num, den, positive=positive)

    if code == "quick_ratio":
        cash_value, reason = _decimal(bal, "balance_sheet", "cash_and_cash_equivalents")
        if reason:
            return None, reason
        receivables, reason = _decimal(bal, "balance_sheet", "accounts_receivable")
        if reason:
            return None, reason
        liabilities, reason = _decimal(bal, "balance_sheet", "total_current_liabilities")
        assert cash_value is not None and receivables is not None
        return _ratio(cash_value + receivables, liabilities, reason, "total_current_liabilities")

    avg_specs = {
        "roa_avg": ("net_income", "total_assets", "income_statement", "balance_sheet"),
        "roe_avg": ("net_income", "total_equity", "income_statement", "balance_sheet"),
        "accounts_receivable_turnover": ("revenue", "accounts_receivable", "income_statement", "balance_sheet"),
        "inventory_turnover": ("cost_of_goods_sold", "inventory", "income_statement", "balance_sheet"),
        "accounts_payable_turnover": ("cost_of_goods_sold", "accounts_payable", "income_statement", "balance_sheet"),
        "total_asset_turnover": ("revenue", "total_assets", "income_statement", "balance_sheet"),
    }
    if code in avg_specs:
        numerator_field, balance_field, numerator_table, balance_table = avg_specs[code]
        numerator, reason = _decimal(inc, numerator_table, numerator_field)
        if reason:
            return None, reason
        average, reason = _average(bal, pbal, balance_table, balance_field)
        return _ratio(numerator, average, reason, f"average_{balance_field}", positive=code == "roe_avg")

    if code == "operating_cash_ratio":
        numerator, reason = _decimal(cash, "cash_flow_statement", "net_cash_from_operating_activities")
        if reason:
            return None, reason
        average, reason = _average(bal, pbal, "balance_sheet", "total_current_liabilities")
        return _ratio(numerator, average, reason, "average_total_current_liabilities", positive=True)

    growth_specs = {
        "revenue_growth": (inc, pinc, "income_statement", "revenue"),
        "gross_profit_growth": (inc, pinc, "income_statement", "gross_profit"),
        "total_assets_growth": (bal, pbal, "balance_sheet", "total_assets"),
        "net_income_growth_abs_base": (inc, pinc, "income_statement", "net_income"),
        "rd_growth_abs_base": (inc, pinc, "income_statement", "research_and_development"),
    }
    if code in growth_specs:
        return _growth(*growth_specs[code])

    if code == "cfo_margin":
        numerator, reason = _decimal(cash, "cash_flow_statement", "net_cash_from_operating_activities")
        if reason:
            return None, reason
        denominator, reason = _decimal(inc, "income_statement", "revenue")
        return _ratio(numerator, denominator, reason, "revenue")

    if code in {"free_cash_flow", "free_cash_flow_margin"}:
        cfo, capex, reason = _pair(cash, "cash_flow_statement", "net_cash_from_operating_activities", "capital_expenditures")
        if reason:
            return None, reason
        assert cfo is not None and capex is not None
        fcf = cfo - capex
        if code == "free_cash_flow":
            return fcf, ""
        revenue, reason = _decimal(inc, "income_statement", "revenue")
        return _ratio(fcf, revenue, reason, "revenue")

    if code == "rd_to_operating_expense":
        fields = ("research_and_development", "selling_expense", "general_and_administrative_expense", "depreciation_and_amortization")
        values: list[Decimal] = []
        for field in fields:
            value, reason = _decimal(inc, "income_statement", field)
            if reason:
                return None, reason
            assert value is not None
            values.append(value)
        return _ratio(values[0], sum(values), "", "operating_expense_total", positive=True)
    raise KeyError(code)


def calculate_panel(tables: Tables, *, target_years: tuple[int, ...] = (2020, 2021, 2022, 2023)) -> list[dict[str, object]]:
    keys = sorted(key for key in tables["income_statement"] if key[1] in target_years)
    rows: list[dict[str, object]] = []
    for company_id, year in keys:
        key, prior_key = (company_id, year), (company_id, year - 1)
        current = {name: table.get(key) for name, table in tables.items()}
        previous = {name: table.get(prior_key) for name, table in tables.items()}
        identity = current["income_statement"] or current["balance_sheet"] or current["cash_flow_statement"] or {}
        output: dict[str, object] = {
            "company_id": company_id,
            "company_name": identity.get("company_name", ""),
            "archetype": identity.get("archetype", ""),
            "fiscal_year": year,
            "information_cutoff_year": year,
            "split_role": "candidate_locked_validation" if year == 2023 else "historical_development",
        }
        for metric in METRICS:
            value, reason = calculate_metric(metric.code, current, previous)
            output[metric.code] = value
            output[f"{metric.code}__missing_reason"] = reason
        rows.append(output)
    return rows


def format_decimal(value: object) -> str:
    if isinstance(value, Decimal):
        return f"{value:.8f}"
    return str(value)


def write_panel(rows: list[dict[str, object]], path: str | Path) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0]) if rows else []
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: format_decimal(value) for key, value in row.items()})
