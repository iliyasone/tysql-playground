// The playground's demo snippets are the bundled tysql examples: real .py files
// under `tysql/examples/` in the tysql package, served by the API from whatever
// tysql the deploy resolved (see api/check.py `_examples`, fetched via getHealth).
// tysql is the single source of truth — this file only holds one seed snippet so
// the editor has something to show before the health fetch resolves (and offline
// in local dev, when the checker server may not be running).

import type { ExampleFile } from "@/lib/api";

export type Example = ExampleFile;

// A copy of tysql/examples/1_dual_track.py — the default first example. Shown on
// first paint; replaced by the API's canonical copy once health resolves.
export const FALLBACK_EXAMPLE: Example = {
  name: "1_dual_track.py",
  title: "Paired tests",
  code: `# Paired tests — pytest × mypy, the dual-track setup this playground runs on.
# One feature, two adjacent tests. mypy_test_* is static-only (assert_type
# positives, type-ignore negatives kept honest by --warn-unused-ignores);
# test_* is runtime (pytest + eval_typing). ⌘/Ctrl+Enter runs both suites at
# once — Check type-checks with the PEP 827 mypy fork, Test runs pytest here in
# your browser. That both agree is the whole point of the prototype.

from typing import TYPE_CHECKING, Literal, assert_type

import typemap_extensions as tm
from typemap.type_eval import eval_typing


class Point:
    x: int
    y: float


# A TypedDict computed from Point's annotations, names uppercased at the type level.
type Loud = tm.NewTypedDict[
    *[tm.Member[tm.Uppercase[a.name], a.type] for a in tm.Iter[tm.Attrs[Point]]]
]


def mypy_test_loud_keys() -> None:  # static: mypy checks it, pytest skips it
    if TYPE_CHECKING:
        p: Loud = {"X": 1, "Y": 2.0}
        assert_type(p["X"], int)
        assert_type(p["Y"], float)
        p["x"]  # type: ignore[misc]  # negative: the lowercase key must be rejected


def test_loud_keys() -> None:  # runtime: pytest checks the evaluated class
    D = eval_typing(Loud)
    assert D.__annotations__ == {"X": int, "Y": float}
    assert D.__required_keys__ == frozenset({"X", "Y"})


def test_uppercase() -> None:
    assert eval_typing(tm.Uppercase[Literal["pep 827"]]) == Literal["PEP 827"]
`,
};

/** True for a "<n>_<name>.py" filename — a bundled example slug / URL path. */
export function isExampleName(name: string): boolean {
  return /^\d+_.+\.py$/.test(name);
}
