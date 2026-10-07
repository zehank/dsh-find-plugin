# Fork notes — dsh-find-plugin 0.4.1

Upstream: [`awesome-dsh-plugin/dsh-find-plugin`](https://github.com/awesome-dsh-plugin/dsh-find-plugin) 0.4.0 (MIT).
This fork exists for one reason: **upstream's `peerDependencies` range excludes the
`0.2.0` DSH line**, so DSH's install preflight refuses the plugin on a 0.2.0 host.
The plugin's code is unchanged and was verified to work on that host.

## The rejection this fixes

```
dsh: installation rejected: Plugin dsh-find-plugin@0.4.0 is incompatible with
dsh 0.2.0-rc.2: peerDependencies {"@deepseek-ai/dsh-tools":"^0.1.0-rc.6 || … || ^0.1.7-alpha.1"}.
Running it may cause crashes or data loss. …
dsh: nothing was installed.
```

`^0.1.x` means `>=0.1.x-<pre> <0.2.0`. The host ships
`@deepseek-ai/dsh-tools@0.2.0-rc.2`, which is outside every listed range. This is a
*semver prerelease* subtlety as much as a version gap: `0.2.0-rc.2` only satisfies a
range whose comparator set contains a `0.2.0`-tuple prerelease, e.g. `^0.2.0-rc.1`.

## What was verified against the real host runtime

Run against the host's own bundled `@deepseek-ai/dsh-tools@0.2.0-rc.2`, loading the
plugin's real `lib/index.js` and calling its tool.

| Check | Result |
|---|---|
| `defineTool(...)` on the plugin's spec | **no throw** — parameters are lowered eagerly, so this compiles |
| Lowered parameter schema | `{type:"object",properties:{query:{type:"string"},limit:{type:"number"},lang:{type:"string"}},"required":["query"]}` |
| Live `execute({query:'tui',limit:3})` | **real GitHub results** — top hit `dsh-TUI` ★4160 |
| `output.render` | renders the expected numbered list with install commands |
| Missing required arg `{}` | rejected — `ToolArgsError: missing required property "query"` |
| Wrong type `{query:42}` | rejected — `ToolArgsError: "query" must be a string` |
| Extra unknown arg | accepted (schema is implicitly open, as upstream intends) |

The only API surface this plugin touches from `dsh-tools` is `defineTool`; its
`parameters` / `output.schema` / `render` / `execute` / `timeoutMs` contract is
unchanged between the `0.1.x` line it declared and `0.2.0-rc.2`.

Reproduce with the bundled Electron-as-Node runtime:

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
```

Point `@deepseek-ai/dsh-tools` at the host copy, import `lib/index.js`, call
`apply(fakeCtx)` with `{ tools: { register } }`, then invoke the captured tool.

## Changes from upstream (complete list)

| File | Change |
|---|---|
| `package.json` | `peerDependencies["@deepseek-ai/dsh-tools"]` gained `\|\| ^0.2.0-rc.1` |
| `package.json` | `version` 0.4.0 → 0.4.1 |
| `package.json` | `prepare` script removed (blocked build step on git installs); `prepack` removed |
| `package.json` | `repository` now points at this fork |
| `README.md` | fork notice + install instructions |

`lib/`, `src/`, `data/`, and `cordis.patch.yml` are **byte-identical** to upstream
0.4.0 (verified by per-file `shasum`). No source line, tool description, or behaviour
was modified.

## Peer range after the fix

```
^0.1.0-rc.6 || ^0.1.1-rc.1 || ^0.1.2-alpha.2 || ^0.1.3-alpha.2 ||
^0.1.5-alpha.1 || ^0.1.6-alpha.1 || ^0.1.7-alpha.1 || ^0.2.0-rc.1
```

Satisfaction, computed with the host's bundled `semver`:

| host dsh-tools | matches |
|---|---|
| `0.1.0-rc.6` | yes (unchanged backward compatibility) |
| `0.1.7-alpha.1` | yes |
| `0.2.0-rc.1` | yes |
| `0.2.0-rc.2` | **yes — the point of this fork** |
| `0.3.0` | no (not yet verified against 0.3.x) |

The `|| ^0.2.0-rc.1` clause is a claim about the `0.2.0` line; it was verified
against `0.2.0-rc.2` specifically. Later `0.2.0-rc.x` builds are not individually
tested.

## If upstream fixes this

Upstream only needs to append `|| ^0.2.0-rc.1` to its own peer range and re-release.
Prefer upstream once it does — this fork can then be dropped.

## Licence

MIT, unchanged. Upstream copyright notice retained verbatim in [`LICENSE`](LICENSE).
