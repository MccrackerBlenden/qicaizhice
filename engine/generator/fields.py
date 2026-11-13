"""Stable output field order and field categories."""

COMMON_FIELDS = [
    "company_id", "company_name", "archetype", "fiscal_year", "currency",
    "amount_unit", "information_cutoff_year", "is_synthetic",
]

INCOME_FIELDS = COMMON_FIELDS + [
    "growth_rate", "gross_margin", "rd_ratio", "selling_ratio", "admin_ratio",
    "tax_rate", "dso_days", "inventory_days", "dpo_days", "capex_ratio",
    "revenue", "cost_of_goods_sold", "gross_profit",
    "research_and_development", "selling_expense",
    "general_and_administrative_expense", "depreciation_and_amortization",
    "operating_income", "other_income", "interest_expense",
    "income_before_tax", "income_tax_expense", "net_income",
]

BALANCE_FIELDS = COMMON_FIELDS + [
    "cash_and_cash_equivalents", "accounts_receivable", "inventory",
    "other_current_assets", "total_current_assets",
    "property_plant_equipment_net", "total_assets", "accounts_payable",
    "accrued_liabilities", "other_operating_liabilities", "short_term_debt",
    "total_current_liabilities", "long_term_debt", "total_liabilities",
    "share_capital", "retained_earnings", "total_equity",
    "total_liabilities_and_equity",
]

CASHFLOW_FIELDS = COMMON_FIELDS + [
    "beginning_revenue", "beginning_cash", "beginning_accounts_receivable",
    "beginning_inventory", "beginning_other_current_assets",
    "beginning_accounts_payable", "beginning_accrued_liabilities",
    "beginning_other_operating_liabilities", "beginning_property_plant_equipment_net",
    "beginning_short_term_debt", "beginning_long_term_debt",
    "beginning_share_capital", "beginning_retained_earnings", "net_income",
    "depreciation_and_amortization", "increase_in_accounts_receivable",
    "increase_in_inventory", "increase_in_other_current_assets",
    "increase_in_accounts_payable", "increase_in_accrued_liabilities",
    "increase_in_other_operating_liabilities", "net_cash_from_operating_activities",
    "capital_expenditures", "net_cash_from_investing_activities",
    "planned_equity_issuance", "emergency_equity_issuance",
    "short_term_debt_proceeds", "long_term_debt_proceeds",
    "short_term_debt_repayment", "long_term_debt_repayment", "dividends_paid",
    "net_cash_from_financing_activities", "net_change_in_cash", "ending_cash",
    "ending_property_plant_equipment_net", "ending_short_term_debt",
    "ending_long_term_debt", "ending_share_capital", "ending_retained_earnings",
    "minimum_cash_reserve", "debt_capacity", "liquidity_shortfall_before_financing",
]

RATE_FIELDS = {
    "growth_rate", "gross_margin", "rd_ratio", "selling_ratio", "admin_ratio",
    "tax_rate", "capex_ratio",
}

DAY_FIELDS = {"dso_days", "inventory_days", "dpo_days"}

NON_AMOUNT_FIELDS = set(COMMON_FIELDS) | RATE_FIELDS | DAY_FIELDS

AMOUNT_FIELDS = {
    field
    for field in set(INCOME_FIELDS + BALANCE_FIELDS + CASHFLOW_FIELDS)
    if field not in NON_AMOUNT_FIELDS
}

TABLE_FIELDS = {
    "income_statement": INCOME_FIELDS,
    "balance_sheet": BALANCE_FIELDS,
    "cash_flow_statement": CASHFLOW_FIELDS,
}
