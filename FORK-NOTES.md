# Fork notes — dsh-find-plugin 0.4.1 / 0.5.0

Upstream: [`awesome-dsh-plugin/dsh-find-plugin`](https://github.com/awesome-dsh-plugin/dsh-find-plugin) 0.4.0 (MIT).

**0.4.1** exists for one reason: **upstream's `peerDependencies` range excludes the
`0.2.0` DSH line**, so DSH's install preflight refuses the plugin on a 0.2.0 host.
No plugin code was changed to make it work — only that metadata.

**0.5.0** then fixes two things that a plugin *inside* DSH can get wrong, both observed
on a real Desktop host: install commands that name the wrong profile, and the absence of
any compatibility signal before an install is attempted. See
[What 0.5.0 changes](#what-050-changes) below.

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

| Version | File | Change |
|---|---|---|
| 0.4.1 | `package.json` | `peerDependencies["@deepseek-ai/dsh-tools"]` gained `\|\| ^0.2.0-rc.1` |
| 0.4.1 | `package.json` | `prepare`/`prepack` scripts removed (a git install must not need a blocked build) |
| 0.4.1 | `package.json` | `repository` now points at this fork |
| 0.4.1 | `README.md` | fork notice + install instructions |
| 0.5.0 | `src/profile.ts` | **new** — install commands name the running profile |
| 0.5.0 | `src/compat.ts` | **new** — declared-DSH-requirement annotation |
| 0.5.0 | `src/github.ts`, `src/index.ts` | use the above; results carry a compat marker |
| 0.5.0 | `src/registry.ts` | `RegistryPlugin.npm` typed (the live registry already ships it) |
| 0.5.0 | `package.json` | `dependencies: { semver }` — correct prerelease range matching is not worth re-deriving |
| 0.5.0 | `tsconfig.json` | **new** — reproduced byte-for-byte (see below) |

`data/` and `cordis.patch.yml` are **byte-identical** to upstream 0.4.0. So were `lib/`
and `src/` in 0.4.1; 0.5.0 changes both, and the shipped `lib/` is a real `tsc` build
of the shipped `src/` — verified by building the unmodified 0.4.0 source first and
diffing against upstream's published `lib/` (all six emitted files identical, which is
what confirms the reconstructed `tsconfig.json` matches the one upstream used).

## What 0.5.0 changes

### 1. Install commands name the profile the host is actually running

Upstream hard-codes `--profile web`. On a Desktop build the profile is `desktop`, and
the failure is *silent*: `dsh plugin --profile web add …` does not error — the CLI
initialises a profile named `web` and installs there, so the command succeeds and the
running application is unchanged.

Commands now read `DSH_PROFILE`, which DSH sets in the processes it starts. The curated
list ships its own `--profile web` strings, so those are re-aimed too, in both the
spaced and `--profile=` spellings.

| Input | `DSH_PROFILE=desktop` |
|---|---|
| `dsh plugin --profile web add github:a/b` | `dsh plugin --profile desktop add github:a/b` |
| `dsh plugin --profile=web add github:a/b` | `dsh plugin --profile desktop add github:a/b` |
| `dsh plugin add github:a/b` | `dsh plugin --profile desktop add github:a/b` |
| `npm install foo` | left untouched |
| *(unset)* | falls back to `web`, upstream's behaviour |

### 2. Every result carries the DSH requirement it declares

`?`, `✓` or `✗` per result, reduced against the running `@deepseek-ai/dsh-tools`
version. Three rules keep it honest:

- **It models the host's install gate and nothing else.** Verified against the host's
  own `evaluatePluginCompatibility` across eight manifests: a plugin with no DSH peer is
  *accepted* by the gate, and a stale `engines.dsh` does **not** block an install. So the
  verdict follows `@deepseek-ai/dsh-*` peers only, and `engines.dsh` is reported
  separately as an advisory. Folding it in would have raised false alarms on plugins DSH
  installs happily — the first version did, which is why it is split out.
- **No manifest, no claim.** `?` means nothing was verified; DSH's install preflight
  remains the gate.
- **The manifest must name the same repository.** A package found by guessing from the
  repo name is used only when its own `repository` field points back at that repo.
  The curated list's mapping is authoritative and is tried first — it matters, because
  real names are scoped: `dsh-TUI` is `@deepseek-harness-tui/dsh-tui`.

Prerelease matching uses `semver` with `includePrerelease`, mirroring the host: the whole
published line is prereleases, and this is the exact subtlety behind the original
rejection — `0.2.0-rc.2` is *not* matched by `^0.1.7-rc.2` even though it is numerically
below `0.2.0`.

Locating the host version needs care, because a profile install deliberately keeps no
`@deepseek-ai` copy on disk. Candidates are tried in order: ESM resolution, `require.resolve`,
Electron's `resourcesPath` (`…/Resources/app.asar/dsh/…`, the Desktop layout), then a walk
up from `process.argv[1]` — symlink-resolved first, because a globally installed `dsh`
puts a *link* in `bin/` there. Verified in a sandbox whose `node_modules` held only
`semver`, so resolution genuinely failed and each fallback had to carry it:

| Scenario | Resolved by | Result |
|---|---|---|
| Desktop (`resourcesPath` present) | resources candidate #0 | `0.2.0-rc.2` |
| `resourcesPath` deleted (plain install) | ancestor walk from `argv[1]`, candidate #4 | `0.2.0-rc.2` |

End-to-end, against real npm data through the installed artifact:

```
ccch1mneyyy/dsh-TUI   curatedNpm=@deepseek-harness-tui/dsh-tui ✓ dsh compat ok (3 DSH peers satisfied)
tomowang/dsh-tui      curatedNpm=@tomowang/dsh-tui            ✗ INCOMPATIBLE — requires ^0.1.7-rc.2 …, host runs 0.2.0-rc.2
cocode-agency/cocode  curatedNpm=undefined                    ? dsh compat unknown
```

That `✗` is the feature earning its keep: `dsh-tui` declares only the `0.1.7` line, so
the host would reject it — exactly the case that used to surface as
`dsh: nothing was installed`.

Reproduce the build with the runtime DSH bundles:

```sh
NODE="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"
"$NODE" node_modules/typescript/bin/tsc -p tsconfig.json
```

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
