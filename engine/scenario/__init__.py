"""Static hypothetical financial scenario prototype."""

from .contracts import ActionPlan, ScenarioAssumptions
from .engine import ScenarioError, run_scenario

__all__ = ["ActionPlan", "ScenarioAssumptions", "ScenarioError", "run_scenario"]
