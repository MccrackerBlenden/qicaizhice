from __future__ import annotations

import bisect
import csv
import hashlib
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


EPSILON = 1e-12
FIT_YEARS = (2020, 2021)
DEV_YEAR = 2022
DIMENSIONS = ("profitability", "solvency", "operations", "growth", "cashflow", "research")
META_FIELDS = (
    "company_id",
    "company_name",
    "archetype",
    "fiscal_year",
    "information_cutoff_year",
    "split_role",
)


class EvaluationError(ValueError):
    """Raised when an evaluation contract is violated."""


@dataclass(frozen=True)
class IndicatorSpec:
    code: str
    name_zh: str
    dimension: str
    suitability: str
    direction: str
    include: bool
    transform: str
    outer_lower_q: float | None
    ideal_lower_q: float | None
    ideal_upper_q: float | None
    outer_upper_q: float | None
    decision_reason: str


@dataclass(frozen=True)
class PanelRow:
    company_id: str
    company_name: str
    archetype: str
    fiscal_year: int
    information_cutoff_year: int
    split_role: str
    values: dict[str, float | None]
    missing_reasons: dict[str, str]


def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _optional_float(value: str) -> float | None:
    if value == "":
        return None
    result = float(value)
    if not math.isfinite(result):
        raise EvaluationError(f"non-finite configuration value: {value!r}")
    return result


def load_indicator_specs(path: str | Path) -> list[IndicatorSpec]:
    with Path(path).open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    specs: list[IndicatorSpec] = []
    seen: set[str] = set()
    for row in rows:
        code = row["code"]
        if code in seen:
            raise EvaluationError(f"duplicate indicator code: {code}")
        seen.add(code)
        spec = IndicatorSpec(
            code=code,
            name_zh=row["name_zh"],
            dimension=row["dimension"],
            suitability=row["suitability"],
            direction=row["direction"],
            include=row["include"] == "1",
            transform=row["transform"],
            outer_lower_q=_optional_float(row["outer_lower_q"]),
            ideal_lower_q=_optional_float(row["ideal_lower_q"]),
            ideal_upper_q=_optional_float(row["ideal_upper_q"]),
            outer_upper_q=_optional_float(row["outer_upper_q"]),
            decision_reason=row["decision_reason"],
        )
        if spec.include and spec.dimension not in DIMENSIONS:
            raise EvaluationError(f"unknown dimension for {code}: {spec.dimension}")
        if spec.include and spec.direction not in {"positive", "inverse", "interval"}:
            raise EvaluationError(f"invalid included direction for {code}: {spec.direction}")
        specs.append(spec)
    if len(specs) != 27:
        raise EvaluationError(f"expected 27 candidate indicators, found {len(specs)}")
    return specs


def load_panel(
    path: str | Path,
    specs: Sequence[IndicatorSpec],
    *,
    allowed_years: Iterable[int],
) -> list[PanelRow]:
    """Load only requested years; skipped years' metric cells are never parsed."""
    allowed = frozenset(int(year) for year in allowed_years)
    if not allowed:
        raise EvaluationError("allowed_years cannot be empty")
    codes = [spec.code for spec in specs]
    output: list[PanelRow] = []
    seen: set[tuple[str, int]] = set()
    with Path(path).open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = set(META_FIELDS)
        for code in codes:
            required.add(code)
            required.add(f"{code}__missing_reason")
        missing_columns = required.difference(reader.fieldnames or ())
        if missing_columns:
            raise EvaluationError(f"missing panel columns: {sorted(missing_columns)}")
        for raw in reader:
            year = int(raw["fiscal_year"])
            if year not in allowed:
                continue
            cutoff = int(raw["information_cutoff_year"])
            if cutoff != year:
                raise EvaluationError(
                    f"future/stale information cutoff for {raw['company_id']}/{year}: {cutoff}"
                )
            key = (raw["company_id"], year)
            if key in seen:
                raise EvaluationError(f"duplicate company-year: {key}")
            seen.add(key)
            values: dict[str, float | None] = {}
            reasons: dict[str, str] = {}
            for code in codes:
                text = raw[code]
                reason = raw[f"{code}__missing_reason"]
                if text == "":
                    if not reason:
                        raise EvaluationError(f"missing {code} lacks reason for {key}")
                    values[code] = None
                else:
                    value = float(text)
                    if not math.isfinite(value):
                        raise EvaluationError(f"non-finite {code} for {key}")
                    if reason:
                        raise EvaluationError(f"present {code} has missing reason for {key}")
                    values[code] = value
                reasons[code] = reason
            output.append(
                PanelRow(
                    company_id=raw["company_id"],
                    company_name=raw["company_name"],
                    archetype=raw["archetype"],
                    fiscal_year=year,
                    information_cutoff_year=cutoff,
                    split_role=raw["split_role"],
                    values=values,
                    missing_reasons=reasons,
                )
            )
    output.sort(key=lambda row: (row.company_id, row.fiscal_year))
    return output


def quantile_linear(values: Sequence[float], q: float) -> float:
    if not values:
        raise EvaluationError("cannot calculate quantile of empty values")
    if not 0 <= q <= 1:
        raise EvaluationError(f"quantile outside [0,1]: {q}")
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + fraction * (ordered[upper] - ordered[lower])


def _fit_transform(spec: IndicatorSpec, values: Sequence[float]) -> dict[str, object]:
    if spec.outer_lower_q is None or spec.outer_upper_q is None:
        raise EvaluationError(f"missing outer quantiles for {spec.code}")
    lower = quantile_linear(values, spec.outer_lower_q)
    upper = quantile_linear(values, spec.outer_upper_q)
    if upper - lower <= EPSILON:
        return {"active": False, "fit_exclusion_reason": "CONSTANT_OR_NEAR_CONSTANT"}
    result: dict[str, object] = {
        "active": True,
        "direction": spec.direction,
        "outer_lower": lower,
        "outer_upper": upper,
    }
    if spec.direction == "interval":
        if spec.ideal_lower_q is None or spec.ideal_upper_q is None:
            raise EvaluationError(f"missing ideal quantiles for {spec.code}")
        ideal_lower = quantile_linear(values, spec.ideal_lower_q)
        ideal_upper = quantile_linear(values, spec.ideal_upper_q)
        if (
            ideal_lower - lower <= EPSILON
            or ideal_upper < ideal_lower
            or upper - ideal_upper <= EPSILON
        ):
            return {"active": False, "fit_exclusion_reason": "DEGENERATE_INTERVAL_QUANTILES"}
        result.update({"ideal_lower": ideal_lower, "ideal_upper": ideal_upper})
    return result


def transform_value(value: float | None, parameters: dict[str, object]) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value):
        raise EvaluationError("cannot transform non-finite value")
    lower = float(parameters["outer_lower"])
    upper = float(parameters["outer_upper"])
    direction = str(parameters["direction"])
    clipped = min(max(value, lower), upper)
    if direction == "positive":
        score = (clipped - lower) / (upper - lower)
    elif direction == "inverse":
        score = (upper - clipped) / (upper - lower)
    elif direction == "interval":
        ideal_lower = float(parameters["ideal_lower"])
        ideal_upper = float(parameters["ideal_upper"])
        if clipped < ideal_lower:
            score = (clipped - lower) / (ideal_lower - lower)
        elif clipped <= ideal_upper:
            score = 1.0
        else:
            score = (upper - clipped) / (upper - ideal_upper)
    else:
        raise EvaluationError(f"unknown direction: {direction}")
    return min(1.0, max(0.0, score))


def _transpose(matrix: Sequence[Sequence[float]]) -> list[list[float]]:
    return [list(column) for column in zip(*matrix, strict=True)]


def entropy_information(matrix: Sequence[Sequence[float]]) -> list[float]:
    if len(matrix) < 2:
        raise EvaluationError("entropy weights require at least two rows")
    information: list[float] = []
    log_n = math.log(len(matrix))
    for column in _transpose(matrix):
        total = sum(column)
        if total <= EPSILON:
            information.append(0.0)
            continue
        entropy_sum = 0.0
        for value in column:
            if value > 0:
                probability = value / total
                entropy_sum += probability * math.log(probability)
        entropy = -entropy_sum / log_n
        information.append(max(0.0, 1.0 - entropy))
    return information


def _pearson(left: Sequence[float], right: Sequence[float]) -> float:
    mean_left = statistics.fmean(left)
    mean_right = statistics.fmean(right)
    centered_left = [value - mean_left for value in left]
    centered_right = [value - mean_right for value in right]
    denominator = math.sqrt(
        sum(value * value for value in centered_left)
        * sum(value * value for value in centered_right)
    )
    if denominator <= EPSILON:
        raise EvaluationError("Pearson correlation received a degenerate column")
    correlation = sum(a * b for a, b in zip(centered_left, centered_right, strict=True)) / denominator
    return min(1.0, max(-1.0, correlation))


def critic_information(matrix: Sequence[Sequence[float]]) -> list[float]:
    columns = _transpose(matrix)
    deviations = [statistics.pstdev(column) for column in columns]
    if any(value <= EPSILON for value in deviations):
        raise EvaluationError("CRITIC received a degenerate column")
    correlations = [[_pearson(left, right) for right in columns] for left in columns]
    return [
        deviations[j] * sum(1.0 - correlations[j][k] for k in range(len(columns)))
        for j in range(len(columns))
    ]


def _normalize_information(values: Sequence[float], method: str) -> list[float]:
    cleaned = [value if value > EPSILON else 0.0 for value in values]
    total = sum(cleaned)
    if total <= EPSILON:
        raise EvaluationError(f"{method} has zero total information")
    return [value / total for value in cleaned]


def fit_model(
    rows: Sequence[PanelRow],
    specs: Sequence[IndicatorSpec],
    *,
    fit_years: Sequence[int] = FIT_YEARS,
) -> dict[str, object]:
    expected_years = frozenset(fit_years)
    if {row.fiscal_year for row in rows} != expected_years:
        raise EvaluationError(
            f"fit rows must contain exactly years {sorted(expected_years)}, got "
            f"{sorted({row.fiscal_year for row in rows})}"
        )
    if any(row.fiscal_year not in expected_years for row in rows):
        raise EvaluationError("non-fit year reached fit_model")
    included = [spec for spec in specs if spec.include]
    parameters: dict[str, dict[str, object]] = {}
    active_specs: list[IndicatorSpec] = []
    transformed_columns: dict[str, list[float | None]] = {}
    for spec in included:
        raw_values = [row.values[spec.code] for row in rows if row.values[spec.code] is not None]
        if len(raw_values) < 2:
            parameters[spec.code] = {"active": False, "fit_exclusion_reason": "INSUFFICIENT_VALUES"}
            continue
        fitted = _fit_transform(spec, raw_values)
        parameters[spec.code] = fitted
        if not bool(fitted["active"]):
            continue
        transformed = [transform_value(row.values[spec.code], fitted) for row in rows]
        finite = [value for value in transformed if value is not None]
        if not finite or max(finite) - min(finite) <= EPSILON or statistics.pstdev(finite) <= EPSILON:
            fitted["active"] = False
            fitted["fit_exclusion_reason"] = "CONSTANT_AFTER_TRANSFORM"
            continue
        fitted["fit_median_standardized"] = quantile_linear(finite, 0.5)
        fitted["fit_nonmissing_count"] = len(finite)
        active_specs.append(spec)
        transformed_columns[spec.code] = transformed
    dimensions_present = {spec.dimension for spec in active_specs}
    missing_dimensions = set(DIMENSIONS).difference(dimensions_present)
    if missing_dimensions:
        raise EvaluationError(f"fit exclusions emptied dimensions: {sorted(missing_dimensions)}")
    matrix: list[list[float]] = []
    for row_index in range(len(rows)):
        matrix.append([
            transformed_columns[spec.code][row_index]
            if transformed_columns[spec.code][row_index] is not None
            else float(parameters[spec.code]["fit_median_standardized"])
            for spec in active_specs
        ])
    entropy_info = entropy_information(matrix)
    critic_info = critic_information(matrix)
    entropy_weights = _normalize_information(entropy_info, "entropy")
    critic_weights = _normalize_information(critic_info, "CRITIC")
    combined_weights = [0.5 * left + 0.5 * right for left, right in zip(entropy_weights, critic_weights, strict=True)]
    weights: dict[str, dict[str, float]] = {}
    for index, spec in enumerate(active_specs):
        weights[spec.code] = {
            "entropy_information": entropy_info[index],
            "critic_information": critic_info[index],
            "entropy_weight": entropy_weights[index],
            "critic_weight": critic_weights[index],
            "combined_weight": combined_weights[index],
        }
    model: dict[str, object] = {
        "model_name": "Qicaizhice synthetic financial evaluation",
        "fit_years": list(fit_years),
        "development_validation_year": DEV_YEAR,
        "candidate_locked_holdout_year": 2023,
        "holdout_scored": False,
        "epsilon": EPSILON,
        "quantile_method": "linear_type7_n_minus_1",
        "standard_deviation": "population_ddof_0",
        "correlation": "pearson",
        "default_entropy_share": 0.5,
        "minimum_dimension_weight_coverage": 0.6,
        "minimum_overall_weight_coverage": 0.75,
        "active_indicators": [spec.code for spec in active_specs],
        "indicator_dimensions": {spec.code: spec.dimension for spec in active_specs},
        "indicator_parameters": parameters,
        "weights": weights,
        "fixed_baseline_scores": [],
    }
    fit_scored = score_rows(rows, model, add_positions=False)
    baseline = sorted(
        float(row["overall_score"])
        for row in fit_scored
        if row["overall_score"] is not None
    )
    if not baseline:
        raise EvaluationError("no valid fit-period overall scores")
    model["fixed_baseline_scores"] = baseline
    model["fit_row_count"] = len(rows)
    return model


def weights_for_entropy_share(model: dict[str, object], entropy_share: float) -> dict[str, float]:
    if not 0 <= entropy_share <= 1:
        raise EvaluationError("entropy_share must be in [0,1]")
    result = {
        code: entropy_share * float(details["entropy_weight"])
        + (1.0 - entropy_share) * float(details["critic_weight"])
        for code, details in dict(model["weights"]).items()
    }
    total = sum(result.values())
    return {code: weight / total for code, weight in result.items()}


def _mid_ecdf(reference: Sequence[float], value: float) -> float:
    ordered = sorted(reference)
    left = bisect.bisect_left(ordered, value)
    right = bisect.bisect_right(ordered, value)
    return 100.0 * (left + 0.5 * (right - left)) / len(ordered)


def score_rows(
    rows: Sequence[PanelRow],
    model: dict[str, object],
    *,
    entropy_share: float = 0.5,
    add_positions: bool = True,
) -> list[dict[str, object]]:
    parameters = dict(model["indicator_parameters"])
    dimensions = dict(model["indicator_dimensions"])
    weights = weights_for_entropy_share(model, entropy_share)
    minimum_dimension = float(model["minimum_dimension_weight_coverage"])
    minimum_overall = float(model["minimum_overall_weight_coverage"])
    dimension_totals = {
        dimension: sum(weight for code, weight in weights.items() if dimensions[code] == dimension)
        for dimension in DIMENSIONS
    }
    output: list[dict[str, object]] = []
    for row in rows:
        normalized = {code: transform_value(row.values[code], parameters[code]) for code in weights}
        valid_codes = [code for code, value in normalized.items() if value is not None]
        valid_weight = sum(weights[code] for code in valid_codes)
        overall = None
        contributions: dict[str, float | None] = {code: None for code in weights}
        if valid_weight + EPSILON >= minimum_overall:
            overall = 100.0 * sum(weights[code] * float(normalized[code]) for code in valid_codes) / valid_weight
            for code in valid_codes:
                contributions[code] = 100.0 * weights[code] * float(normalized[code]) / valid_weight
        result: dict[str, object] = {
            "company_id": row.company_id,
            "company_name": row.company_name,
            "archetype": row.archetype,
            "fiscal_year": row.fiscal_year,
            "information_cutoff_year": row.information_cutoff_year,
            "split_role": row.split_role,
            "overall_score": overall,
            "valid_weight_coverage": valid_weight,
            "entropy_share": entropy_share,
        }
        for dimension in DIMENSIONS:
            dimension_codes = [code for code in weights if dimensions[code] == dimension]
            dimension_valid = [code for code in dimension_codes if normalized[code] is not None]
            available_weight = sum(weights[code] for code in dimension_valid)
            total_weight = dimension_totals[dimension]
            coverage = available_weight / total_weight if total_weight > EPSILON else 0.0
            result[f"{dimension}_weight_coverage"] = coverage
            result[f"score_{dimension}"] = (
                100.0
                * sum(weights[code] * float(normalized[code]) for code in dimension_valid)
                / available_weight
                if coverage + EPSILON >= minimum_dimension and available_weight > EPSILON
                else None
            )
        for code in weights:
            result[f"norm_{code}"] = normalized[code]
            result[f"contrib_{code}"] = contributions[code]
            result[f"missing_reason_{code}"] = row.missing_reasons[code]
        valid_contributions = [(code, value) for code, value in contributions.items() if value is not None]
        valid_norms = [(code, value) for code, value in normalized.items() if value is not None]
        result["top_contributors"] = ";".join(
            f"{code}:{value:.6f}" for code, value in sorted(valid_contributions, key=lambda item: (-item[1], item[0]))[:3]
        )
        result["weakest_indicators"] = ";".join(
            f"{code}:{value:.6f}" for code, value in sorted(valid_norms, key=lambda item: (item[1], item[0]))[:3]
        )
        output.append(result)
    if add_positions:
        valid_by_year: dict[int, list[float]] = {}
        for result in output:
            if result["overall_score"] is not None:
                valid_by_year.setdefault(int(result["fiscal_year"]), []).append(float(result["overall_score"]))
        baseline = [float(value) for value in list(model["fixed_baseline_scores"])]
        for result in output:
            score = result["overall_score"]
            if score is None:
                result["within_year_percentile"] = None
                result["fixed_baseline_percentile"] = None
            else:
                result["within_year_percentile"] = _mid_ecdf(valid_by_year[int(result["fiscal_year"])], float(score))
                result["fixed_baseline_percentile"] = _mid_ecdf(baseline, float(score))
        for year in sorted(valid_by_year):
            candidates = [result for result in output if int(result["fiscal_year"]) == year and result["overall_score"] is not None]
            candidates.sort(key=lambda item: (-float(item["overall_score"]), str(item["company_id"])))
            for rank, result in enumerate(candidates, start=1):
                result["within_year_rank"] = rank
        for result in output:
            result.setdefault("within_year_rank", None)
    return output


def average_ranks(values: Sequence[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda index: (values[index], index))
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        average = (start + 1 + end) / 2.0
        for position in range(start, end):
            ranks[order[position]] = average
        start = end
    return ranks


def spearman_correlation(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or len(left) < 2:
        raise EvaluationError("Spearman inputs must have equal length >= 2")
    return _pearson(average_ranks(left), average_ranks(right))


def dump_json(path: str | Path, payload: object) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        handle.write("\n")


def _csv_value(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, float):
        if not math.isfinite(value):
            raise EvaluationError("refusing to write non-finite CSV value")
        return f"{value:.12f}"
    return value


def write_csv(path: str | Path, rows: Sequence[dict[str, object]], fieldnames: Sequence[str] | None = None) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    names = list(fieldnames or (list(rows[0]) if rows else []))
    with Path(path).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=names, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({name: _csv_value(row.get(name)) for name in names})

