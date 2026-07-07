# tysql playground

A web playground for [tysql](https://github.com/iliyasone/tysql) — write a SQL
statement as a Python *type* and see it type-checked live by the
[PEP 827 mypy fork](https://github.com/iliyasone/mypy-typemap). Without a
tysql import it doubles as a plain **PEP 827 playground** (the header follows
along). Snippets never execute on a server.

## How it works

One Vercel project, three runtimes:

- **Frontend** — Next.js (App Router) with a CodeMirror editor, example
  presets, inline diagnostics, light/dark themes (device default), and
  shareable `#code=` links.
- **Check** — a single Python 3.14 serverless function,
  [`api/check.py`](api/check.py), that runs the mypy fork in-process on the
  posted snippet (the same check `tysql check` performs) and returns parsed
  diagnostics as JSON. Snippets are parsed, never executed, server-side.
- **Run** — [`public/py-worker.js`](public/py-worker.js), a Web Worker that
  boots Pyodide (real CPython 3.14 on WebAssembly, ~20 MB downloaded once from
  the CDN), micropip-installs `tysql` from PyPI, and executes the snippet
  entirely **in the visitor's browser** — nothing user-written ever runs on a
  server. `reveal_type` is shimmed to `typing.reveal_type`, a hung run is
  stopped by terminating the worker, and the results pane compares the static
  verdict against the runtime one. (`typing-extensions` is installed
  explicitly because `python-typemap` imports it without declaring it.)

Dependencies in [`requirements.txt`](requirements.txt) point at **git heads**,
so every deploy snapshots the latest `tysql@main` and the fork. A deploy hook
(see below) rebuilds the playground on every push to tysql, keeping it current
without pinning.

## Local development

```bash
npm install
uv venv --python 3.14 .venv && uv pip install -p .venv -r requirements.txt

.venv/bin/python api/check.py   # API on 127.0.0.1:5328
npm run dev                     # UI on 127.0.0.1:3000 (proxies /api/* to 5328)
```

## Deploying

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com/new)
   — the Next.js preset, the Python function, `.python-version` (3.14) and
   `vercel.json` (`maxDuration: 60`) are all picked up automatically.
2. First build takes a few minutes (it builds the mypy fork from git).

### Track tysql `main` automatically

1. Vercel → project → **Settings → Git → Deploy Hooks** → create a hook
   (e.g. `tysql-main`, branch `main`) and copy its URL.
2. In the **tysql** repo on GitHub: **Settings → Secrets and variables →
   Actions** → add secret `VERCEL_DEPLOY_HOOK_URL` with that URL.
3. Commit `.github/workflows/redeploy-playground.yml` (already prepared in the
   tysql repo) — every push to tysql `main` now redeploys the playground.

## Vercel quirk: stripped `.pyi` / `py.typed`

Vercel's Python bundler strips `*.pyi` and `py.typed` from installed
dependencies (`shouldStripVendorFile` in
[vercel/vercel `packages/python`](https://github.com/vercel/vercel/tree/main/packages/python)) —
which deletes mypy's entire bundled typeshed and unmarks tysql/typemap as
typed. The playground works around both at cold start:

- [`api/typeshed.tar.gz`](api/typeshed.tar.gz) (the fork's typeshed, tarballs
  survive bundling) is extracted to `/tmp` and passed via
  `--custom-typeshed-dir`. Regenerate it after the fork's typeshed changes:
  `tar -czf api/typeshed.tar.gz -C .venv/lib/python3.14/site-packages/mypy typeshed`
- `tysql`/`typemap`/`typemap_extensions` are mirrored to `/tmp` with `py.typed`
  restored and served through `MYPYPATH`. For `typemap_extensions` the stripped
  `__init__.pyi` (its entire typed interface — a one-line re-export of the fork
  typeshed's `_typeshed/typemap.pyi`) is recreated in the mirror; without it
  every PEP 827 combinator silently degrades to `Any`.

`GET /api/check?debug=1` reports the deployed state (marker file, typeshed
file count, applied flags, and a self-check run).

## Notes

- The first check after an idle period is a cold start (~5–10 s: interpreter
  boot + un-mypyc'd mypy check of the snippet's import graph). Warm checks take
  ~300–500 ms; identical re-runs hit mypy's cache in ~20 ms.
- mypy never executes the snippet, so the serverless function's own isolation
  is sufficient sandboxing; input is capped at 64 KiB.
