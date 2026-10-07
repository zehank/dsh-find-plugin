/**
 * Declared-DSH-compatibility annotation for search results.
 *
 * The failure this addresses is the one that costs the most time: a plugin whose
 * declared peers exclude the running host is rejected at install time with a
 * message about `peerDependencies`, which reads like a broken plugin when it is
 * usually just a stale range. Surfacing the declaration next to the result turns
 * that into something visible before the install is attempted.
 *
 * Three rules keep the annotation honest:
 *
 *  1. **The verdict models the host's install gate, and nothing else.** That gate
 *     is driven by `@deepseek-ai/dsh-*` peer ranges. Verified against the host's
 *     own `evaluatePluginCompatibility`: a manifest with no DSH peer is accepted,
 *     and a stale `engines.dsh` does *not* block an install. Folding `engines.dsh`
 *     into the verdict would therefore raise false alarms on plugins DSH installs
 *     happily, so it is reported separately as an advisory the gate ignores.
 *  2. **A verdict is only reported when a manifest was actually read.** No
 *     manifest, no claim — the verdict is `unknown`, never an optimistic guess.
 *  3. **The manifest must be attributable to the repository shown.** A package
 *     found under a guessed name is only accepted when its own `repository` field
 *     points back at that GitHub repository, so a squatter sharing a name cannot
 *     lend its declarations to someone else's plugin.
 *
 * The comparison mirrors the host's semantics for prereleases: the whole published
 * line is prereleases, so `includePrerelease` is on and an empty range counts as
 * failing rather than as permission.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireFromHere = createRequire(import.meta.url)

export type CompatVerdict = 'compatible' | 'incompatible' | 'unknown'

/**
 * Declared as a type alias rather than an interface deliberately: only an alias
 * carries the implicit index signature that makes it assignable to the tool
 * output's `JsonValue`, which the interface form fails on.
 */
export type CompatFinding = {
  verdict: CompatVerdict
  /** Distinct `@deepseek-ai/dsh-*` peer ranges as declared — what the host gates on. */
  peers: string[]
  /** The subset of {@link peers} the running host fails; empty unless incompatible. */
  failing: string[]
  /** `engines.dsh`, when the manifest declares one. Advisory: the gate ignores it. */
  engines?: string
  /** False when the declared `engines.dsh` excludes the running host. */
  enginesSatisfied?: boolean
  /** The running `@deepseek-ai/dsh-tools` version, or null when unlocatable. */
  runtime: string | null
  source: 'npm-latest' | 'none'
}

interface SemverLike {
  satisfies: (version: string, range: string, options?: { includePrerelease?: boolean }) => boolean
}

const NPM_TIMEOUT_MS = 4000
const OK_TTL_MS = 30 * 60 * 1000
const FAIL_TTL_MS = 2 * 60 * 1000

/** DSH core packages, by the naming the host itself gates on. */
const DSH_PEER = /^@deepseek-ai\/dsh(?:-|$)/u

let cachedSemver: SemverLike | null | undefined

/**
 * Load `semver` lazily so a missing dependency degrades the annotation to
 * `unknown` instead of failing plugin load — a listing tool must never be the
 * reason a boot fails.
 * @returns The module, or null when it cannot be loaded.
 */
function loadSemver(): SemverLike | null {
  if (cachedSemver !== undefined) return cachedSemver
  try {
    const loaded = requireFromHere('semver') as SemverLike
    cachedSemver = typeof loaded?.satisfies === 'function' ? loaded : null
  } catch {
    cachedSemver = null
  }
  return cachedSemver
}

let cachedRuntime: string | null | undefined

/**
 * The running host's core version, read from the `@deepseek-ai/dsh-tools`
 * manifest in the same tree the host resolved this plugin's own import from.
 * Every `@deepseek-ai/dsh-*` package ships on one version line, which is why
 * this single value answers for the peers plugins declare.
 * @returns The version, or null when no host copy is locatable.
 */
/** Path parts from a host root to the manifest whose version is the runtime. */
const RUNTIME_MANIFEST = ['node_modules', '@deepseek-ai', 'dsh-tools', 'package.json']

/** Every directory from `start` up to the filesystem root. */
function ancestorDirs(start: string): string[] {
  const dirs: string[] = []
  let dir = start
  for (;;) {
    dirs.push(dir)
    const parent = dirname(dir)
    if (parent === dir || parent.length === 0) break
    dir = parent
  }
  return dirs
}

function manifestVersion(path: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version.length > 0 ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Where the running host's `@deepseek-ai/dsh-tools` manifest might live, most
 * direct first. Resolution is tried first because the host resolved this
 * plugin's own `@deepseek-ai/dsh-tools` import somehow — but a profile install
 * deliberately keeps no `@deepseek-ai` copy on disk, so on a Desktop build the
 * answer usually comes from Electron's resources directory or from walking up
 * from the entry script instead.
 * @returns Candidate manifest paths, in the order they should be tried.
 */
export function hostManifestCandidates(): string[] {
  const candidates: string[] = []
  const specifier = '@deepseek-ai/dsh-tools/package.json'

  try {
    const meta = import.meta as unknown as { resolve?: (s: string) => unknown }
    const resolved = typeof meta.resolve === 'function' ? meta.resolve(specifier) : undefined
    if (typeof resolved === 'string' && resolved.length > 0) candidates.push(resolved)
  } catch { /* not resolvable from here */ }
  try {
    candidates.push(requireFromHere.resolve(specifier))
  } catch { /* not resolvable from here */ }

  const resources = (process as unknown as { resourcesPath?: unknown }).resourcesPath
  if (typeof resources === 'string' && resources.length > 0) {
    candidates.push(join(resources, 'app.asar', 'dsh', ...RUNTIME_MANIFEST))
    candidates.push(join(resources, 'app', 'dsh', ...RUNTIME_MANIFEST))
    candidates.push(join(resources, 'dsh', ...RUNTIME_MANIFEST))
  }

  // A normal install keeps the host as the ancestor that owns
  // `node_modules/@deepseek-ai/dsh-tools`. The entry is resolved through
  // symlinks first, because for a globally installed `dsh` it is a link in a
  // `bin/` directory and walking up from the link reaches `/` without ever
  // passing the package.
  const entry = process.argv[1]
  if (typeof entry === 'string' && entry.length > 0) {
    let start = dirname(entry)
    try {
      start = dirname(realpathSync(entry))
    } catch { /* keep the unresolved path */ }
    for (const dir of ancestorDirs(start)) candidates.push(join(dir, ...RUNTIME_MANIFEST))
  }
  return candidates
}

/**
 * The running host's core version. Every `@deepseek-ai/dsh-*` package ships on
 * one version line, and `dsh-tools` is the one the host's install gate compares
 * peer ranges against, so that manifest answers for all of them.
 * @returns The version, or null when no host copy is locatable.
 */
export function dshRuntimeVersion(): string | null {
  if (cachedRuntime !== undefined) return cachedRuntime
  cachedRuntime = null
  for (const candidate of hostManifestCandidates()) {
    const version = manifestVersion(candidate)
    if (version !== undefined) {
      cachedRuntime = version
      break
    }
  }
  return cachedRuntime
}

/**
 * The `@deepseek-ai/dsh-*` peer ranges a manifest declares.
 * @param manifest A package manifest.
 * @returns Ranges as written; empty when the package declares none.
 */
export function dshPeerRequirements(manifest: Record<string, unknown>): string[] {
  const peers = manifest.peerDependencies as Record<string, unknown> | undefined
  const found: string[] = []
  for (const [name, range] of Object.entries(peers ?? {})) {
    if (DSH_PEER.test(name) && typeof range === 'string' && range.trim().length > 0) found.push(range.trim())
  }
  return found
}

/**
 * The `engines.dsh` a manifest declares, in either accepted position.
 * @param manifest A package manifest.
 * @returns The range, or undefined when undeclared.
 */
export function dshEnginesDeclaration(manifest: Record<string, unknown>): string | undefined {
  const engines = manifest.engines as Record<string, unknown> | undefined
  const fromEngines = engines?.dsh
  if (typeof fromEngines === 'string' && fromEngines.trim().length > 0) return fromEngines.trim()
  const dsh = manifest.dsh as Record<string, unknown> | undefined
  const fromDsh = (dsh?.engines as Record<string, unknown> | undefined)?.dsh
  if (typeof fromDsh === 'string' && fromDsh.trim().length > 0) return fromDsh.trim()
  return undefined
}

/**
 * Whether one range admits the running host.
 * @returns True/false, or null when either side makes the answer unknowable.
 */
export function rangeSatisfied(range: string, runtime: string | null): boolean | null {
  if (runtime === null) return null
  const semver = loadSemver()
  if (semver === null) return null
  try {
    return semver.satisfies(runtime, range, { includePrerelease: true })
  } catch {
    return null
  }
}

/**
 * Reduce the peer ranges the host gates on.
 * @param peers Declared peer ranges.
 * @param runtime Running core version, or null.
 * @returns `unknown` when either side is missing or unparseable — never a guess.
 */
export function compatVerdict(peers: string[], runtime: string | null): CompatVerdict {
  if (runtime === null || peers.length === 0) return 'unknown'
  for (const range of peers) {
    const satisfied = rangeSatisfied(range, runtime)
    if (satisfied === null) return 'unknown'
    if (!satisfied) return 'incompatible'
  }
  return 'compatible'
}

/** `owner/repo` from any GitHub spelling, lower-cased, or '' when not GitHub. */
export function normalizeGitHubRepository(value: unknown): string {
  const raw = typeof value === 'string'
    ? value
    : (value as { url?: unknown } | undefined)?.url
  if (typeof raw !== 'string') return ''
  const cleaned = raw.trim().toLowerCase()
    .replace(/^git\+/u, '')
    .replace(/^ssh:\/\/git@/u, 'https://')
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/^git:\/\//u, 'https://')
    .replace(/\.git$/u, '')
    .replace(/\/+$/u, '')
  const match = /github\.com\/([^/]+)\/([^/]+)/u.exec(cleaned)
  return match === null ? '' : `${match[1]}/${match[2]}`
}

type NpmEntry = { at: number; manifest?: Record<string, unknown>; failed?: boolean }

const npmCache = new Map<string, NpmEntry>()

/**
 * Read one package's published `latest` manifest, cached per process. Only the
 * `latest` document is fetched — small, and enough to read declarations from.
 * @param name npm package name.
 * @param signal Caller cancellation.
 * @returns The manifest, or undefined when absent or unreachable.
 */
async function npmLatestManifest(name: string, signal?: AbortSignal): Promise<Record<string, unknown> | undefined> {
  const key = name.toLowerCase()
  const hit = npmCache.get(key)
  if (hit !== undefined && Date.now() - hit.at < (hit.failed === true ? FAIL_TTL_MS : OK_TTL_MS)) {
    return hit.manifest
  }
  const signalFor = (): AbortSignal =>
    signal === undefined ? AbortSignal.timeout(NPM_TIMEOUT_MS) : AbortSignal.any([signal, AbortSignal.timeout(NPM_TIMEOUT_MS)])
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(key)}/latest`, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-find-plugin' },
      signal: signalFor(),
    })
    if (!res.ok) {
      npmCache.set(key, { at: Date.now(), failed: true })
      return undefined
    }
    const manifest = (await res.json()) as Record<string, unknown>
    npmCache.set(key, { at: Date.now(), manifest })
    return manifest
  } catch {
    npmCache.set(key, { at: Date.now(), failed: true })
    return undefined
  }
}

/**
 * Annotate one GitHub result. When the repository name and the npm package name
 * differ, the caller supplies the curated list's own mapping as `npmName`.
 * @param fullName GitHub `owner/repo` of the result.
 * @param npmName Curated npm package name, when the list knows one.
 * @param signal Caller cancellation.
 * @returns The finding; `unknown` whenever a manifest could not be established.
 */
export async function annotateCompatibility(
  fullName: string,
  npmName?: string,
  signal?: AbortSignal,
): Promise<CompatFinding> {
  const runtime = dshRuntimeVersion()
  const unknown: CompatFinding = { verdict: 'unknown', peers: [], failing: [], runtime, source: 'none' }
  if (runtime === null) return unknown

  // The curated mapping is authoritative; otherwise the repository name is only
  // a candidate, and the manifest must prove the match itself.
  const candidates = npmName !== undefined && npmName.trim().length > 0
    ? [npmName.trim().toLowerCase()]
    : [fullName.split('/')[1]?.toLowerCase() ?? ''].filter(name => name.length > 0)

  for (const candidate of candidates) {
    const manifest = await npmLatestManifest(candidate, signal)
    if (manifest === undefined) continue
    if (normalizeGitHubRepository(manifest.repository) !== fullName.toLowerCase()) continue
    const peers = [...new Set(dshPeerRequirements(manifest))]
    const engines = dshEnginesDeclaration(manifest)
    const enginesSatisfied = engines === undefined ? undefined : rangeSatisfied(engines, runtime) ?? undefined
    return {
      // Declaring no DSH peer is not a failure — the host installs such a
      // manifest, and calling that `unknown` would understate what we know.
      verdict: peers.length === 0 ? 'compatible' : compatVerdict(peers, runtime),
      peers,
      failing: peers.filter(range => rangeSatisfied(range, runtime) === false),
      ...engines === undefined ? {} : { engines },
      ...enginesSatisfied === undefined ? {} : { enginesSatisfied },
      runtime,
      source: 'npm-latest',
    }
  }
  return unknown
}

/** Collapse a declared range to something a list row can carry. */
function shortRange(range: string): string {
  const collapsed = range.replace(/\s+/gu, ' ').trim()
  return collapsed.length <= 56 ? collapsed : `${collapsed.slice(0, 55)}…`
}

/** A compact marker for the rendered list. */
export function compatMarker(finding: CompatFinding | undefined): string {
  if (finding === undefined || finding.verdict === 'unknown') return '? dsh compat unknown'
  if (finding.verdict === 'incompatible') {
    // Only the ranges the host actually fails are named — a plugin declares one
    // peer per core package it uses, so quoting them all buries the reason.
    const shown = finding.failing.slice(0, 2).map(shortRange).join(' ∧ ')
    const rest = finding.failing.length > 2 ? ` (+${finding.failing.length - 2} more)` : ''
    return `✗ dsh compat INCOMPATIBLE — requires ${shown}${rest}, this host runs ${finding.runtime}`
  }
  const base = finding.peers.length === 0
    ? '✓ dsh compat ok (no DSH peer declared)'
    : `✓ dsh compat ok (${finding.peers.length} DSH peer${finding.peers.length === 1 ? '' : 's'} satisfied)`
  return finding.enginesSatisfied === false
    ? `${base}; note: declares engines.dsh ${shortRange(finding.engines ?? '')}, outside this host — not enforced at install`
    : base
}
