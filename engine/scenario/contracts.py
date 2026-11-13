from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ActionPlan:
    """Controllable actions. All rates are decimals, all amounts are CNY_10K."""

    receivables_collection_rate: float = 0.0
    inventory_release_rate: float = 0.0
    selling_expense_reduction_rate: float = 0.0
    admin_expense_reduction_rate: float = 0.0
    short_term_debt_proceeds: float = 0.0
    long_term_debt_proceeds: float = 0.0
    capital_expenditure: float = 0.0
    incremental_rd_expense: float = 0.0


@dataclass(frozen=True)
class ScenarioAssumptions:
    """Explicit assumptions; none are claimed to be historically identified."""

    collection_cost_rate: float = 0.02
    inventory_action_cost_rate: float = 0.03
    expense_change_implementation_cost_rate: float = 0.10
    debt_financing_fee_rate: float = 0.01
    short_term_interest_rate: float = 0.05
    long_term_interest_rate: float = 0.045
    new_debt_interest_year_fraction: float = 0.50
    capex_current_year_depreciation_rate: float = 0.05
    minimum_cash_ratio_to_revenue: float = 0.03
    maximum_debt_to_assets: float = 0.75
    minimum_interest_coverage: float = 1.20
    maximum_receivables_collection_rate: float = 0.60
    maximum_inventory_release_rate: float = 0.40
    maximum_expense_reduction_rate: float = 0.25
    maximum_new_debt_to_revenue: float = 0.30
    maximum_incremental_rd_to_revenue: float = 0.15
    maximum_capex_to_revenue: float = 0.20

    def validate(self) -> None:
        rate_names = (
            "collection_cost_rate", "inventory_action_cost_rate",
            "expense_change_implementation_cost_rate", "debt_financing_fee_rate",
            "short_term_interest_rate", "long_term_interest_rate",
            "new_debt_interest_year_fraction", "capex_current_year_depreciation_rate",
            "minimum_cash_ratio_to_revenue", "maximum_debt_to_assets",
            "maximum_receivables_collection_rate", "maximum_inventory_release_rate",
            "maximum_expense_reduction_rate", "maximum_new_debt_to_revenue",
            "maximum_incremental_rd_to_revenue", "maximum_capex_to_revenue",
        )
        for name in rate_names:
            value = getattr(self, name)
            if not 0 <= value <= 1:
                raise ValueError(f"{name} must be in [0,1]")
        if self.minimum_interest_coverage < 0:
            raise ValueError("minimum_interest_coverage must be non-negative")
