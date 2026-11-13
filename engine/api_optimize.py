#!/usr/bin/env python3
"""Local finite-grid search gateway for synthetic 2022 company only.

No dynamic code execution, no disk writes, one JSON object via stdin, one JSON via stdout.
User constraints are additional filters on the frozen finite grid, not changes to the
validated engine guardrails. This deliberately does NOT read frozen candidate CSV/JSON.
"""
from __future__ import annotations
import hashlib
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from optimization.grid_optimizer import (load_config, search, iter_grid, pareto_front,
    GridOptimizationError, VARIABLES)
from optimization.safe_input import load_safe_statement_slice, SafeInputError
from scenario.contracts import ScenarioAssumptions
from scenario.engine import load_frozen_model, ScenarioError

COMPANIES = ("VPM-071", "VPM-101", "VPM-203")
CASES = ("conservative", "neutral", "optimistic")
OBJECTIVES = ("score", "cost", "cash")
FIELDS = {"company", "year", "case", "objective", "minimum_score_delta",
          "maximum_action_cost", "maximum_debt_ratio", "minimum_cash_headroom"}


def numeric_optional(obj, field, low, high):
    x = obj.get(field)
    if x is None: return None
    if isinstance(x, bool) or not isinstance(x, (int,float)) or not math.isfinite(x):
        raise ValueError(f"{field} 必须是有限数值或 null")
    if not low <= x <= high:
        raise ValueError(f"{field} 超出允许的输入范围")
    return float(x)


def compact(row):
    return {key:row[key] for key in [
        'company_id','case','decision_id',*VARIABLES,'overall_before','overall_after','score_delta',
        'total_action_cost','ending_cash','cash_headroom','debt_to_assets','interest_coverage',
        'accounting_checks_passed','accounting_checks_total','accounting_max_abs_residual',
        'working_capital_release','borrowed_funds','implementation_cash_cost','incremental_interest'
    ]}


def main():
    started=time.monotonic()
    obj=json.load(sys.stdin)
    if not isinstance(obj,dict) or set(obj)-FIELDS:
        raise ValueError('优化请求字段不合法')
    company=obj.get('company'); year=obj.get('year'); case=obj.get('case')
    objective=obj.get('objective','score')
    if company not in COMPANIES or type(year) is not int or year!=2022:
        raise ValueError('有限网格优化 现场优化仅支持三家合成企业的 2022 年')
    if case not in CASES or objective not in OBJECTIVES:
        raise ValueError('搜索情景或排序目标不合法')
    minimum_score_delta=numeric_optional(obj,'minimum_score_delta',-100,100)
    maximum_action_cost=numeric_optional(obj,'maximum_action_cost',0,1e9)
    maximum_debt_ratio=numeric_optional(obj,'maximum_debt_ratio',0,1)
    minimum_cash_headroom=numeric_optional(obj,'minimum_cash_headroom',0,1e9)
    limits={'minimum_score_delta':minimum_score_delta,
            'maximum_action_cost':maximum_action_cost,
            'maximum_debt_ratio':maximum_debt_ratio,
            'minimum_cash_headroom':minimum_cash_headroom}

    config_path=ROOT/'optimization/search_config.json'
    cfg=load_config(config_path)
    tables=load_safe_statement_slice()
    model=load_frozen_model(ROOT/'evaluation/outputs/frozen_parameters.json')
    grid=tuple(iter_grid(cfg))
    rows,_=search(config=cfg,baseline_assumptions=ScenarioAssumptions(),tables=tables,
                  frozen_model=model,companies=(company,),cases=(case,),plans=grid,
                  retain_details=False)
    feasible=[r for r in rows if r['feasible']]
    def matches(row):
        return ((minimum_score_delta is None or row['score_delta']>=minimum_score_delta-1e-9)
            and (maximum_action_cost is None or row['total_action_cost']<=maximum_action_cost+1e-8)
            and (maximum_debt_ratio is None or row['debt_to_assets']<=maximum_debt_ratio+1e-10)
            and (minimum_cash_headroom is None or row['cash_headroom']>=minimum_cash_headroom-1e-8))
    eligible=[r for r in feasible if matches(r)]
    if objective=='cost':
        eligible.sort(key=lambda r:(r['total_action_cost'],-r['score_delta'],r['decision_id']))
    elif objective=='cash':
        eligible.sort(key=lambda r:(-r['cash_headroom'],-r['score_delta'],r['decision_id']))
    else:
        eligible.sort(key=lambda r:(-r['score_delta'],r['total_action_cost'],r['decision_id']))
    pareto=pareto_front(eligible)
    # For transparency all eligible Pareto points are returned (at most 1620).
    baseline_scores={float(r['overall_before']) for r in feasible}
    if len(baseline_scores)>1:
        raise GridOptimizationError('基准评分对账失败')
    print(json.dumps({
       'ok':True,'kind':'有限网格优化 live deterministic finite-grid search',
       'company':company,'year':2022,'case':case,'objective':objective,
       'constraints':limits,
       'engine_executed':True,'reused_frozen_candidates':False,
       'evaluated':len(rows),'engine_feasible':len(feasible),'user_constraints_feasible':len(eligible),
       'engine_rejected':len(rows)-len(feasible),'pareto_count':len(pareto),
       'base_score':next(iter(baseline_scores),None),
       'recommended':compact(eligible[0]) if eligible else None,
       'top_candidates':[compact(r) for r in eligible[:12]],
       'pareto':[compact(r) for r in pareto[:60]],
       'elapsed_seconds':round(time.monotonic()-started,3),
       'config_id':cfg['config_id'],
       'config_sha256':hashlib.sha256(config_path.read_bytes()).hexdigest(),
       'disclaimer':'仅三家虚构企业2022年度、已冻结有限网格内的静态反事实。用户约束是搜索后的追加筛选，未放松冻结财务护栏；不是未来预测或真实经营最优解。'
    },ensure_ascii=False,allow_nan=False))

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,TypeError,ScenarioError,GridOptimizationError,SafeInputError) as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False))
        sys.exit(2)
    except Exception:
        print(json.dumps({'ok':False,'error':'有限网格优化 安全优化内部失败，请检查本地数据及冻结模型。'},ensure_ascii=False))
        sys.exit(3)
