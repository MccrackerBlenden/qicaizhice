#!/usr/bin/env python3
"""Local synthetic static counterfactual gateway, from isolated 2021/2022 synthetic data only.

Reads ONE JSON request via stdin, prints ONE JSON response via stdout. No file write.
"""
import json
import math
import sys
from dataclasses import fields
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from optimization.safe_input import load_safe_statement_slice
from scenario.contracts import ActionPlan, ScenarioAssumptions
from scenario.engine import run_scenario, ScenarioError, load_frozen_model

ALLOWED = {"VPM-071","VPM-101","VPM-203"}
ACTIONS = {f.name for f in fields(ActionPlan)}

def value(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
        raise ValueError("所有行动参数必须是有限的非负数字")
    if x < 0: raise ValueError("行动参数不能为负数")
    return float(x)

def main():
    obj=json.load(sys.stdin)
    if not isinstance(obj,dict): raise ValueError("请求必须是 JSON 对象")
    company=obj.get("company")
    if company not in ALLOWED: raise ValueError("当前仅验证三家2022企业")
    if obj.get("year",2022)!=2022: raise ValueError("仅验证 2022 年")
    incoming=obj.get("plan",{})
    if not isinstance(incoming,dict) or set(incoming)-ACTIONS:
        raise ValueError("操作字段不合法")
    plan=ActionPlan(**{k:value(v) for k,v in incoming.items()})
    tables=load_safe_statement_slice()
    model=load_frozen_model(ROOT/"evaluation/outputs/frozen_parameters.json")
    result=run_scenario(tables,company,plan,ScenarioAssumptions(),model,year=2022)
    base=result["baseline_statements"]; calc=result["scenario_statements"]
    numbers={}
    for table,fields_ in {
        "income_statement":["revenue","net_income","operating_income","research_and_development","selling_expense"],
        "balance_sheet":["cash_and_cash_equivalents","accounts_receivable","inventory","total_assets","total_liabilities","total_equity","short_term_debt","long_term_debt"],
        "cash_flow_statement":["net_cash_from_operating_activities","net_cash_from_investing_activities","net_cash_from_financing_activities","ending_cash"]
    }.items():
        numbers[table]={field:{"before":float(base[table][field]),"after":float(calc[table][field])} for field in fields_}
    out={
        "ok":True,"kind":"静态情景计算 live Python counterfactual",
        "company":company,"year":2022,
        "baseline_score":result["baseline_score"]["overall_score"],
        "scenario_score":result["scenario_score"]["overall_score"],
        "score_delta":result["score_delta"],
        "effects":result["effects"],"constraints":result["constraints"],
        "financial_checks":result["financial_checks"],"numbers":numbers,
        "disclaimer":result["disclaimer"],"lag_uncertainty":result["lag_uncertainty"]
    }
    print(json.dumps(out,allow_nan=False,ensure_ascii=False))
if __name__=="__main__":
    try: main()
    except (ValueError,KeyError,TypeError,ScenarioError) as exc:
        print(json.dumps({"ok":False,"error":str(exc)},ensure_ascii=False))
        sys.exit(2)
    except Exception:
        # Avoid accidental leakage of file paths or runtime stacktraces to HTTP clients.
        print(json.dumps({"ok":False,"error":"安全计算服务内部校验失败；请运行本地诊断并检查版本与数据完整性。"},ensure_ascii=False))
        sys.exit(3)
