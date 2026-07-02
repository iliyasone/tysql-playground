# tysql playground

A web playground for [tysql](https://github.com/iliyasone/tysql) — write a SQL
statement as a Python *type* and see it type-checked live by the
[PEP 827 mypy fork](https://github.com/iliyasone/mypy-typemap). Snippets are
**type-checked only, never executed**.

## How it works

One Vercel project, two runtimes:

- **Frontend** — Next.js (App Router) with a CodeMirror editor, example
  presets, inline diagnostics, and shareable `#code=` links.
- **Backend** — a single Python 3.14 serverless function,
  [`api/check.py`](api/check.py), that runs the mypy fork in-process on the
  posted snippet (the same check `tysql check` performs) and returns parsed
  diagnostics as JSON.

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
- `tysql`/`typemap` are mirrored to `/tmp` with `py.typed` restored and served
  through `MYPYPATH`.

`GET /api/check?debug=1` reports the deployed state (marker file, typeshed
file count, applied flags, and a self-check run).

## Notes

- The first check after an idle period is a cold start (~5–10 s: interpreter
  boot + un-mypyc'd mypy check of the snippet's import graph). Warm checks take
  ~300–500 ms; identical re-runs hit mypy's cache in ~20 ms.
- mypy never executes the snippet, so the serverless function's own isolation
  is sufficient sandboxing; input is capped at 64 KiB.
