"""Fail-closed reader for the read-only synthetic 2021/2022 slice."""

from __future__ import annotations

import csv
import hashlib
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Mapping

from generator.fields import AMOUNT_FIELDS, DAY_FIELDS, RATE_FIELDS, TABLE_FIELDS


SAFE_ROOT = (Path(__file__).resolve().parent / "safe_inputs").resolve()
TABLES = ("income_statement", "balance_sheet", "cash_flow_statement")
ALLOWED_COMPANY_IDS = frozenset({"VPM-071", "VPM-101", "VPM-203"})
ALLOWED_YEARS = frozenset({2021, 2022})
EXPECTED_SHA256: dict[str, str] = {
    "income_statement": "8a801d3b58e3eec2290c95a3efcb31cb970d373cb5b7597f312c364054a5c71e",
    "balance_sheet": "add372215e403f9c35ea2bd68e6d2dac0661620bd4f7930c70093b41038e5a48",
    "cash_flow_statement": "c03d49be913344c1c1c1467ed88a43f1886b639c8db922fe8917428ffd3e4881",
}


class SafeInputError(ValueError):
    """The dedicated input boundary rejected a path or data contract."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _expected_paths() -> dict[str, Path]:
    return {table: SAFE_ROOT / f"{table}.csv" for table in TABLES}


def _validate_whitelist(paths: Mapping[str, str | Path] | None) -> dict[str, Path]:
    expected = _expected_paths()
    supplied = expected if paths is None else {name: Path(path) for name, path in paths.items()}
    if set(supplied) != set(TABLES):
        raise SafeInputError("exactly the three explicitly whitelisted statement files are required")
    resolved: dict[str, Path] = {}
    for table in TABLES:
        candidate = supplied[table]
        if candidate.is_symlink():
            raise SafeInputError(f"symlinks are forbidden: {candidate}")
        try:
            actual = candidate.resolve(strict=True)
        except FileNotFoundError as exc:
            raise SafeInputError(f"missing safe input: {candidate}") from exc
        permitted = expected[table].resolve(strict=True)
        if actual != permitted:
            raise SafeInputError(f"path outside explicit safe-input whitelist: {candidate}")
        resolved[table] = actual
    csv_names = {path.name for path in SAFE_ROOT.glob("*.csv")}
    expected_names = {path.name for path in expected.values()}
    if csv_names != expected_names:
        raise SafeInputError(f"unexpected CSV set in safe_inputs: {sorted(csv_names ^ expected_names)}")
    return resolved


def _parse_and_validate_file(
    path: Path,
    table: str,
    *,
    expected_digest: str | None,
) -> dict[tuple[str, int], dict[str, object]]:
    """Parse one candidate; exposed internally so tests can inject fake violations."""
    if table not in TABLES:
        raise SafeInputError(f"unknown statement table: {table}")
    if expected_digest is not None:
        if len(expected_digest) != 64:
            raise SafeInputError(f"missing frozen SHA256 for {table}")
        actual_digest = sha256_file(path)
        if actual_digest != expected_digest:
            raise SafeInputError(f"SHA256 mismatch for {table}")
    required_fields = TABLE_FIELDS[table]
    indexed: dict[tuple[str, int], dict[str, object]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != required_fields:
            raise SafeInputError(f"field contract mismatch for {table}")
        for raw in reader:
            try:
                year = int(raw["fiscal_year"])
                cutoff = int(raw["information_cutoff_year"])
            except (KeyError, TypeError, ValueError) as exc:
                raise SafeInputError(f"invalid year metadata in {table}") from exc
            company_id = raw.get("company_id", "")
            if year not in ALLOWED_YEARS:
                raise SafeInputError(f"extra or locked year in {table}: {year}")
            if company_id not in ALLOWED_COMPANY_IDS:
                raise SafeInputError(f"unexpected company in {table}: {company_id}")
            if cutoff != year:
                raise SafeInputError(f"information cutoff mismatch in {table}/{company_id}/{year}")
            if raw.get("currency") != "CNY" or raw.get("amount_unit") != "CNY_10K":
                raise SafeInputError(f"currency/amount unit mismatch in {table}/{company_id}/{year}")
            if raw.get("is_synthetic") != "true":
                raise SafeInputError(f"non-synthetic row in {table}/{company_id}/{year}")
            for field in set(required_fields) & (AMOUNT_FIELDS | RATE_FIELDS | DAY_FIELDS):
                try:
                    value = Decimal(raw[field])
                except (InvalidOperation, KeyError) as exc:
                    raise SafeInputError(f"invalid numeric field in {table}/{company_id}/{year}: {field}") from exc
                if not value.is_finite():
                    raise SafeInputError(f"non-finite field in {table}/{company_id}/{year}: {field}")
                scale = 4 if field in RATE_FIELDS else 2
                if max(0, -value.as_tuple().exponent) > scale:
                    raise SafeInputError(f"decimal scale exceeds contract in {table}/{company_id}/{year}: {field}")
            key = (company_id, year)
            if key in indexed:
                raise SafeInputError(f"duplicate primary key in {table}: {key}")
            indexed[key] = dict(raw)
    expected_keys = {(company_id, year) for company_id in ALLOWED_COMPANY_IDS for year in ALLOWED_YEARS}
    if set(indexed) != expected_keys or len(indexed) != 6:
        raise SafeInputError(f"incomplete safe slice for {table}")
    return indexed


def load_safe_statement_slice(
    paths: Mapping[str, str | Path] | None = None,
) -> dict[str, dict[tuple[str, int], dict[str, object]]]:
    """Load only immutable files under optimization/safe_inputs; never fall back."""
    resolved = _validate_whitelist(paths)
    tables = {
        table: _parse_and_validate_file(
            resolved[table], table, expected_digest=EXPECTED_SHA256[table]
        )
        for table in TABLES
    }
    key_sets = {frozenset(rows) for rows in tables.values()}
    if len(key_sets) != 1:
        raise SafeInputError("three-statement primary-key sets differ")
    for key in next(iter(key_sets)):
        metadata = {
            tuple(tables[table][key][field] for field in ("company_name", "archetype", "currency", "amount_unit"))
            for table in TABLES
        }
        if len(metadata) != 1:
            raise SafeInputError(f"three-statement metadata mismatch: {key}")
    return tables
