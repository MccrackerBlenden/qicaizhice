"""Single source of truth for the financial indicator contract."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDefinition:
    code: str
    name: str
    category: str
    formula: str
    source_fields: str
    unit: str
    time_grain: str
    average_balance_rule: str
    applicability: str


NO_AVERAGE = "不使用平均余额"
AVG_BALANCE = "(本年期末余额 + 上年期末余额) / 2；仅使用 t 与 t-1，不跨企业、不读取未来年度"
ANNUAL = "企业-财政年度"


METRICS: tuple[MetricDefinition, ...] = (
    MetricDefinition("gross_margin", "毛利率", "盈利", "gross_profit / revenue", "利润表.gross_profit, revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0"),
    MetricDefinition("operating_margin", "营业利润率", "盈利", "operating_income / revenue", "利润表.operating_income, revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0；允许营业亏损"),
    MetricDefinition("net_margin", "净利率", "盈利", "net_income / revenue", "利润表.net_income, revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0；允许净亏损"),
    MetricDefinition("roa_avg", "平均资产收益率", "盈利", "net_income / average(total_assets)", "利润表.net_income；资产负债表.total_assets(t,t-1)", "ratio", ANNUAL, AVG_BALANCE, "存在上年余额且平均资产大于 0；允许净亏损"),
    MetricDefinition("roe_avg", "平均净资产收益率", "盈利", "net_income / average(total_equity)", "利润表.net_income；资产负债表.total_equity(t,t-1)", "ratio", ANNUAL, AVG_BALANCE, "存在上年余额且平均权益大于 0；负/零平均权益不适用"),
    MetricDefinition("current_ratio", "流动比率", "偿债", "total_current_assets / total_current_liabilities", "资产负债表.total_current_assets, total_current_liabilities", "ratio", ANNUAL, NO_AVERAGE, "期末流动负债不为 0"),
    MetricDefinition("quick_ratio", "速动比率", "偿债", "(cash_and_cash_equivalents + accounts_receivable) / total_current_liabilities", "资产负债表.cash_and_cash_equivalents, accounts_receivable, total_current_liabilities", "ratio", ANNUAL, NO_AVERAGE, "期末流动负债不为 0"),
    MetricDefinition("liabilities_to_assets", "资产负债率", "偿债", "total_liabilities / total_assets", "资产负债表.total_liabilities, total_assets", "ratio", ANNUAL, NO_AVERAGE, "期末资产不为 0"),
    MetricDefinition("interest_coverage", "利息保障倍数", "偿债", "operating_income / interest_expense", "利润表.operating_income, interest_expense", "multiple", ANNUAL, NO_AVERAGE, "利息费用大于 0；允许营业亏损导致负倍数"),
    MetricDefinition("liabilities_to_equity", "产权比率", "偿债", "total_liabilities / total_equity", "资产负债表.total_liabilities, total_equity", "multiple", ANNUAL, NO_AVERAGE, "期末权益大于 0；负/零权益不适用"),
    MetricDefinition("accounts_receivable_turnover", "应收账款周转率", "营运", "revenue / average(accounts_receivable)", "利润表.revenue；资产负债表.accounts_receivable(t,t-1)", "times_per_year", ANNUAL, AVG_BALANCE, "存在上年余额且平均应收账款大于 0"),
    MetricDefinition("inventory_turnover", "存货周转率", "营运", "cost_of_goods_sold / average(inventory)", "利润表.cost_of_goods_sold；资产负债表.inventory(t,t-1)", "times_per_year", ANNUAL, AVG_BALANCE, "存在上年余额且平均存货大于 0"),
    MetricDefinition("accounts_payable_turnover", "应付账款周转率", "营运", "cost_of_goods_sold / average(accounts_payable)", "利润表.cost_of_goods_sold；资产负债表.accounts_payable(t,t-1)", "times_per_year", ANNUAL, AVG_BALANCE, "存在上年余额且平均应付账款大于 0"),
    MetricDefinition("total_asset_turnover", "总资产周转率", "营运", "revenue / average(total_assets)", "利润表.revenue；资产负债表.total_assets(t,t-1)", "times_per_year", ANNUAL, AVG_BALANCE, "存在上年余额且平均资产大于 0"),
    MetricDefinition("revenue_growth", "营业收入增长率", "成长", "(revenue_t - revenue_t-1) / abs(revenue_t-1)", "利润表.revenue(t,t-1)", "ratio", ANNUAL, NO_AVERAGE, "存在上年数据且上年收入不为 0"),
    MetricDefinition("gross_profit_growth", "毛利润增长率", "成长", "(gross_profit_t - gross_profit_t-1) / abs(gross_profit_t-1)", "利润表.gross_profit(t,t-1)", "ratio", ANNUAL, NO_AVERAGE, "存在上年数据且上年毛利润不为 0"),
    MetricDefinition("total_assets_growth", "总资产增长率", "成长", "(total_assets_t - total_assets_t-1) / abs(total_assets_t-1)", "资产负债表.total_assets(t,t-1)", "ratio", ANNUAL, NO_AVERAGE, "存在上年数据且上年资产不为 0"),
    MetricDefinition("net_income_growth_abs_base", "净利润变动率（绝对基期）", "成长", "(net_income_t - net_income_t-1) / abs(net_income_t-1)", "利润表.net_income(t,t-1)", "ratio", ANNUAL, NO_AVERAGE, "存在上年数据且上年净利润不为 0；基期取绝对值以保留亏损转盈/盈转亏方向"),
    MetricDefinition("cfo_margin", "经营现金流利润率", "现金流", "net_cash_from_operating_activities / revenue", "现金流量表.net_cash_from_operating_activities；利润表.revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0；允许 CFO 为负"),
    MetricDefinition("operating_cash_ratio", "经营现金流动负债比", "现金流", "net_cash_from_operating_activities / average(total_current_liabilities)", "现金流量表.net_cash_from_operating_activities；资产负债表.total_current_liabilities(t,t-1)", "ratio", ANNUAL, AVG_BALANCE, "存在上年余额且平均流动负债大于 0；允许 CFO 为负"),
    MetricDefinition("cash_to_assets", "现金资产比", "现金流", "cash_and_cash_equivalents / total_assets", "资产负债表.cash_and_cash_equivalents, total_assets", "ratio", ANNUAL, NO_AVERAGE, "期末资产不为 0"),
    MetricDefinition("free_cash_flow", "自由现金流", "现金流", "net_cash_from_operating_activities - capital_expenditures", "现金流量表.net_cash_from_operating_activities, capital_expenditures", "CNY_10K", ANNUAL, NO_AVERAGE, "两项金额均存在；允许为负"),
    MetricDefinition("free_cash_flow_margin", "自由现金流利润率", "现金流", "(net_cash_from_operating_activities - capital_expenditures) / revenue", "现金流量表.net_cash_from_operating_activities, capital_expenditures；利润表.revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0；允许自由现金流为负"),
    MetricDefinition("rd_intensity", "研发强度", "研发", "research_and_development / revenue", "利润表.research_and_development, revenue", "ratio", ANNUAL, NO_AVERAGE, "营业收入不为 0"),
    MetricDefinition("rd_to_gross_profit", "研发投入毛利比", "研发", "research_and_development / gross_profit", "利润表.research_and_development, gross_profit", "ratio", ANNUAL, NO_AVERAGE, "毛利润大于 0"),
    MetricDefinition("rd_growth_abs_base", "研发投入增长率（绝对基期）", "研发", "(research_and_development_t - research_and_development_t-1) / abs(research_and_development_t-1)", "利润表.research_and_development(t,t-1)", "ratio", ANNUAL, NO_AVERAGE, "存在上年数据且上年研发投入不为 0"),
    MetricDefinition("rd_to_operating_expense", "研发费用占经营费用比", "研发", "research_and_development / (research_and_development + selling_expense + general_and_administrative_expense + depreciation_and_amortization)", "利润表.research_and_development, selling_expense, general_and_administrative_expense, depreciation_and_amortization", "ratio", ANNUAL, NO_AVERAGE, "经营费用合计大于 0"),
)

METRIC_BY_CODE = {metric.code: metric for metric in METRICS}
