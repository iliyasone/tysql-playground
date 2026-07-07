// Playground presets. Every snippet is valid tysql from the README/tests;
// lines marked "error" are deliberate, to show what the checker rejects.
// The leading comment block carries what used to be a UI blurb.

export type Example = {
  id: string;
  title: string;
  code: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "hello",
    title: "SELECT & projection",
    code: `# SELECT & projection — a statement is a type.
# Projected columns become the row type; reading any other column is a type error.

from typing import TYPE_CHECKING, Literal

from tysql import Col, Cols, PrimaryKey, Select, Table, run
from tysql.render import render


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


stmt = Select[User, Cols[Col[User, Literal["id"]], Col[User, Literal["email"]]]]

print(render(stmt))  # Run renders the SQL — right in your browser

if TYPE_CHECKING:  # run() is the static contract; there is no database bridge yet
    rows = run(stmt, data=None)
    reveal_type(rows[0]["id"])     # int — inferred
    reveal_type(rows[0]["email"])  # str — inferred
    rows[0]["age"]  # error: "age" was not selected
`,
  },
  {
    id: "typo",
    title: "Catch a typo",
    code: `# Catch a typo — a column that does not exist is rejected at the reference site.
# Run still renders the broken SQL: only the type checker stands between
# this statement and your database.

from typing import TYPE_CHECKING, Literal

from tysql import Col, Cols, PrimaryKey, Select, Table, run
from tysql.render import render


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


# "emial" is not a column of User — the statement itself is ill-typed
stmt = Select[User, Cols[Col[User, Literal["emial"]]]]

print(render(stmt))  # runtime happily renders SELECT "user"."emial" …

if TYPE_CHECKING:
    rows = run(stmt, data=None)  # error: Col: no such column
`,
  },
  {
    id: "where",
    title: "WHERE & inferred params",
    code: `# WHERE & inferred params — params in the WHERE clause become required,
# typed keys of data=. A wrong value type is rejected.

from typing import TYPE_CHECKING, Literal

from tysql import Col, Cols, Eq, Param, PrimaryKey, Select, Table, Where, run
from tysql.render import render


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


stmt = Select[
    User,
    Cols[Col[User, Literal["id"]]],
    Where[Eq[Col[User, Literal["age"]], Param[Literal["min_age"], int]]],
]

print(render(stmt))  # SELECT … WHERE "user"."age" = %(min_age)s

if TYPE_CHECKING:  # the params of run() are inferred from the statement
    run(stmt, data={"min_age": 21})    # ok
    run(stmt, data={"min_age": "21"})  # error: "min_age" must be int
`,
  },
  {
    id: "join",
    title: "JOIN, COUNT & GROUP BY",
    code: `# JOIN, COUNT & GROUP BY — an INNER JOIN with an ON predicate, a Count
# aggregate under an alias, GROUP BY and ORDER BY. The row type is computed
# through all of it.

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from tysql import (
    As, Col, Cols, Count, Eq, ForeignKey, GroupBy, InnerJoin, On, OrderBy,
    PrimaryKey, Select, Table, run,
)
from tysql.render import render


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


class Post(Table):
    id: PrimaryKey[int]
    author: ForeignKey[User, Literal["id"]]
    created_at: datetime
    text: str


stmt = Select[
    InnerJoin[User, Post, On[Eq[Col[User, Literal["id"]], Col[Post, Literal["author"]]]]],
    Cols[Col[User, Literal["id"]], As[Count[Col[Post, Literal["id"]]], Literal["n_posts"]]],
    GroupBy[Col[User, Literal["id"]]],
    OrderBy[Col[User, Literal["id"]], Literal["asc"]],
]

print(render(stmt))

if TYPE_CHECKING:
    rows = run(stmt, data=None)
    reveal_type(rows[0]["n_posts"])  # int
`,
  },
  {
    id: "scope",
    title: "Column out of scope",
    code: `# Column out of scope — projecting a column whose table is not in the
# FROM/JOIN clause is caught; the column is mapped back to its table.

from datetime import datetime
from typing import TYPE_CHECKING, Literal

from tysql import Col, Cols, ForeignKey, PrimaryKey, Select, Table, run
from tysql.render import render


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


class Post(Table):
    id: PrimaryKey[int]
    author: ForeignKey[User, Literal["id"]]
    created_at: datetime
    text: str


# Post.text is a real column — but Post is not in the FROM clause
stmt = Select[User, Cols[Col[Post, Literal["text"]]]]

print(render(stmt))  # runtime renders SQL that selects from the wrong table

if TYPE_CHECKING:
    rows = run(stmt, data=None)  # error: Col: table is not in the FROM clause
`,
  },
  {
    id: "pep827",
    title: "Pure PEP 827 — no SQL",
    code: `# Pure PEP 827 — no tysql: compute types from types.
# Check evaluates this statically with the mypy fork; Run evaluates the very
# same program with typemap at runtime, in your browser.

from typing import Literal

import typemap_extensions as tm
from typemap.type_eval import eval_typing


class Point:
    x: int
    y: float


# A TypedDict computed from Point's annotations — names uppercased at the type level
Loud = tm.NewTypedDict[
    *[tm.Member[tm.Uppercase[a.name], a.type] for a in tm.Iter[tm.Attrs[Point]]]
]


def f(p: Loud) -> None:
    reveal_type(p["X"])  # int — computed statically
    reveal_type(p["Y"])  # float
    p["x"]               # error: the key is "X" now


print(eval_typing(tm.Uppercase[Literal["pep 827"]]))  # the same machinery, at runtime
`,
  },
  {
    id: "paired",
    title: "Paired tests — pytest × mypy",
    code: `# Paired tests — the metatypes convention: one feature, two adjacent tests.
# mypy_test_X is static-only (assert_type positives, type-ignore negatives,
# kept honest by --warn-unused-ignores); test_X is runtime (pytest +
# eval_typing). The Test button runs both suites at once.

from typing import TYPE_CHECKING, Literal, assert_type

import typemap_extensions as tm
from typemap.type_eval import eval_typing


class Point:
    x: int
    y: float


# A TypedDict computed from Point's annotations, names uppercased
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
  },
];

export const DEFAULT_EXAMPLE_ID = "hello";
