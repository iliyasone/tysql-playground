// Playground presets. Every snippet is valid tysql from the README/tests;
// lines marked "error" are deliberate, to show what the checker rejects.

export type Example = {
  id: string;
  title: string;
  blurb: string;
  code: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "hello",
    title: "SELECT & projection",
    blurb:
      "A statement is a type. The projected columns become the row type; reading anything else is a type error.",
    code: `from typing import Literal

from tysql import Col, Cols, PrimaryKey, Select, Table, run


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


# SELECT id, email FROM "user"
rows = run(
    Select[User, Cols[Col[User, Literal["id"]], Col[User, Literal["email"]]]],
    data=None,
)

reveal_type(rows[0]["id"])     # int — inferred
reveal_type(rows[0]["email"])  # str — inferred

rows[0]["age"]  # error: "age" was not selected
`,
  },
  {
    id: "typo",
    title: "Catch a typo",
    blurb:
      'A column that does not exist on its table is rejected at the reference site: "Col: no such column".',
    code: `from typing import Literal

from tysql import Col, Cols, PrimaryKey, Select, Table, run


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


# "emial" is not a column of User — the statement itself is ill-typed
rows = run(Select[User, Cols[Col[User, Literal["emial"]]]], data=None)
`,
  },
  {
    id: "where",
    title: "WHERE & inferred params",
    blurb:
      "Params in the WHERE clause become required, typed keys of `data`. A wrong value type is rejected.",
    code: `from typing import Literal

from tysql import Col, Cols, Eq, Param, PrimaryKey, Select, Table, Where, run


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


# SELECT id FROM "user" WHERE age = %(min_age)s
stmt = Select[
    User,
    Cols[Col[User, Literal["id"]]],
    Where[Eq[Col[User, Literal["age"]], Param[Literal["min_age"], int]]],
]

run(stmt, data={"min_age": 21})    # ok — params inferred from the statement
run(stmt, data={"min_age": "21"})  # error: "min_age" must be int
`,
  },
  {
    id: "join",
    title: "JOIN, COUNT & GROUP BY",
    blurb:
      "An INNER JOIN with an ON predicate, a Count aggregate under an alias, GROUP BY and ORDER BY — the row type is computed through all of it.",
    code: `from datetime import datetime
from typing import Literal

from tysql import (
    As, Col, Cols, Count, Eq, ForeignKey, GroupBy, InnerJoin, On, OrderBy,
    PrimaryKey, Select, Table, run,
)


class User(Table):
    id: PrimaryKey[int]
    age: int
    email: str


class Post(Table):
    id: PrimaryKey[int]
    author: ForeignKey[User, Literal["id"]]
    created_at: datetime
    text: str


# SELECT "user"."id", count("post"."id") AS "n_posts"
# FROM "user" INNER JOIN "post" ON "user"."id" = "post"."author"
# GROUP BY "user"."id" ORDER BY "user"."id" ASC;
stmt = Select[
    InnerJoin[User, Post, On[Eq[Col[User, Literal["id"]], Col[Post, Literal["author"]]]]],
    Cols[Col[User, Literal["id"]], As[Count[Col[Post, Literal["id"]]], Literal["n_posts"]]],
    GroupBy[Col[User, Literal["id"]]],
    OrderBy[Col[User, Literal["id"]], Literal["asc"]],
]

rows = run(stmt, data=None)
reveal_type(rows[0]["n_posts"])  # int
`,
  },
  {
    id: "scope",
    title: "Column out of scope",
    blurb:
      "Projecting a column whose table is not in the FROM/JOIN clause is caught — the column is mapped back to its table.",
    code: `from datetime import datetime
from typing import Literal

from tysql import Col, Cols, ForeignKey, PrimaryKey, Select, Table, run


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
rows = run(Select[User, Cols[Col[Post, Literal["text"]]]], data=None)
`,
  },
];

export const DEFAULT_EXAMPLE_ID = "hello";
