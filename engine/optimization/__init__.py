"""isolated deterministic optimization package.

Public entry points are imported explicitly by their module paths.  Keeping
package initialization side-effect free prevents the obsolete early
draft contract from being imported into the formal execution chain.
"""

__all__: list[str] = []
