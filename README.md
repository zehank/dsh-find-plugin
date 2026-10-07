# dsh-find-plugin [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

English | [中文](README.zh.md)

> ### Fork notice
>
> This is an **unofficial fork** of
> [`awesome-dsh-plugin/dsh-find-plugin`](https://github.com/awesome-dsh-plugin/dsh-find-plugin)
> (MIT), by [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin).
>
> **Why:** upstream 0.4.0 declares
> `peerDependencies: { "@deepseek-ai/dsh-tools": "^0.1.0-rc.6 || … || ^0.1.7-alpha.1" }`.
> Every one of those ranges stops below `0.2.0`, so DSH's install preflight rejects
> the plugin on a `0.2.0` host even though the code itself works there. The `^0.2.0-rc.1`
> alternative added in 0.4.1 was the **only** change needed to make it install; 0.5.0
> then adds two host-awareness fixes.
>
> **What changed from upstream 0.4.0:**
>
> 1. *(0.4.1)* `peerDependencies["@deepseek-ai/dsh-tools"]` gained `|| ^0.2.0-rc.1`.
> 2. *(0.4.1)* The `prepare` script was removed, so `dsh plugin add github:…` installs the
>    committed `lib/` as-is instead of triggering a blocked build step.
> 3. *(0.5.0)* **Install commands name the profile you are actually running**, read from
>    `DSH_PROFILE`. Upstream hard-codes `--profile web`; on a Desktop build that command
>    does not fail — it silently creates a *separate* `web` profile and installs there,
>    leaving your app unchanged.
> 4. *(0.5.0)* **Every result carries the DSH requirement it declares**, reduced against
>    the running host: `✓` fine, `✗` the install gate will reject it, `?` no attributable
>    manifest was found. Plugins with a stale peer line are now visible *before* you try.
> 5. *(0.5.0)* Adds a `semver` runtime dependency, because correct prerelease range
>    matching is exactly what the original rejection hinged on and is not worth
>    re-deriving by hand.
>
> `data/` and `cordis.patch.yml` remain byte-identical to upstream 0.4.0. See
> [FORK-NOTES.md](FORK-NOTES.md) for the full change list and the verification evidence,
> including how the compat verdict was checked against the host's own
> `evaluatePluginCompatibility`.

**A plugin that finds plugins** — think [`/find-skills`](https://skills.sh) from skills.sh, for DSH.

Tell your agent what you want ("notify me on WeChat when a task finishes"),
and it searches the DSH plugin ecosystem on GitHub for you — top results by
stars, each with a one-line description and an install command.

<img src="https://raw.githubusercontent.com/awesome-dsh-plugin/dsh-find-plugin/main/assets/demo-en.png" alt="find_dsh_plugin in action" width="640">

## Install

```sh
# from this fork (GitHub)
dsh plugin --profile desktop add github:zehank/dsh-find-plugin

# or from a local checkout
dsh plugin --profile desktop add file:/absolute/path/to/dsh-find-plugin
```

Replace `desktop` with your profile name (`dsh web` users normally use `web`).
Restart DSH afterwards if the tool does not appear immediately.

## Usage

Restart `dsh web` after installing, then just talk to the agent — it calls
`find_dsh_plugin` on its own whenever plugin discovery helps:

- "What terminal TUI plugins are there?"
- "I want to get a WeChat notification when a task finishes — any plugin for that?"
- "Find me something for reviewing git diffs inside DSH."

Each result comes back with stars, a description, the repo link, and a
ready-to-run `dsh plugin add` command — ask the agent to install one and
it can run the command for you.

## How it works

- Live GitHub repository search scoped to the official `dsh-plugin` topic,
  re-ranked by stars (5-minute per-query cache).
- When a result is also listed on
  [awesome-dsh-plugin](https://awesome-dsh-plugin.com), its hand-written
  bilingual description from `plugins.json` replaces the GitHub one (the
  `lang` parameter picks the language) — ranking is untouched.
- Every result comes with a ready-to-run `dsh plugin add` command. Plugins
  are third-party code — review the source and pin a commit.

### Rate limits and offline fallback

GitHub's **search** API allows only 10 requests/minute per public IP when
unauthenticated, and that quota is shared by every host behind the same egress
IP (carrier CGNAT, corporate NAT, …), so a search can fail with `HTTP 403` for
reasons outside your control. The plugin therefore:

- uses the **`GITHUB_TOKEN` DSH credential** when one is configured (30
  req/min, account-scoped, immune to shared-IP exhaustion). Optional — without
  it the tool still works, just closer to the anonymous limit;
- retries a rate-limited (403/429) or failed request once, then degrades
  instead of failing: it falls back to **keyword matches from the curated
  list** and says so in the result note;
- caches the curated list on disk (`$DSH_HOME/cache/dsh-find-plugin/`) and
  revalidates it with `If-None-Match` / `If-Modified-Since`, so restarts and
  offline runs use the full ~3400-entry list instead of the small bundled
  snapshot.
- says *why* a request failed. Node reports every transport failure as a bare
  `fetch failed` and hides the useful part in `cause`, so the plugin surfaces
  the chain (`fetch failed ← certificate has expired (CERT_HAS_EXPIRED)`) and
  names the one trap that otherwise looks like a plugin bug: a system proxy or
  VPN accelerator, which Node's `fetch` ignores unless DSH itself was started
  with `NODE_USE_ENV_PROXY=1` (or `--use-env-proxy`). A browser has no such
  rule — which is why GitHub opens fine and this still fails.

## Compatibility

DSH plugin APIs are prerelease-versioned, and node-semver only lets a
prerelease satisfy a range that carries a prerelease on the *same*
major.minor.patch — so a peer range pinned to one host line silently stops
matching the next one. The declared `@deepseek-ai/dsh-tools` range therefore
names every shipped line through `0.1.7`, and `npm run check:peers` (run in CI)
resolves the current `latest`/`next` host lines from the registry and fails the
day a new one is not covered.

## Development

```sh
npm run typecheck                     # tsc --noEmit
npm test                              # offline tests (mocked fetch)
FINDP_LIVE=1 npm run test:live        # opt-in real-network cases
```

## License

MIT © awesome-dsh-plugin
