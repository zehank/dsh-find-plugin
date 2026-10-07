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
export type CompatVerdict = 'compatible' | 'incompatible' | 'unknown';
/**
 * Declared as a type alias rather than an interface deliberately: only an alias
 * carries the implicit index signature that makes it assignable to the tool
 * output's `JsonValue`, which the interface form fails on.
 */
export type CompatFinding = {
    verdict: CompatVerdict;
    /** Distinct `@deepseek-ai/dsh-*` peer ranges as declared — what the host gates on. */
    peers: string[];
    /** The subset of {@link peers} the running host fails; empty unless incompatible. */
    failing: string[];
    /** `engines.dsh`, when the manifest declares one. Advisory: the gate ignores it. */
    engines?: string;
    /** False when the declared `engines.dsh` excludes the running host. */
    enginesSatisfied?: boolean;
    /** The running `@deepseek-ai/dsh-tools` version, or null when unlocatable. */
    runtime: string | null;
    source: 'npm-latest' | 'none';
};
/**
 * Where the running host's `@deepseek-ai/dsh-tools` manifest might live, most
 * direct first. Resolution is tried first because the host resolved this
 * plugin's own `@deepseek-ai/dsh-tools` import somehow — but a profile install
 * deliberately keeps no `@deepseek-ai` copy on disk, so on a Desktop build the
 * answer usually comes from Electron's resources directory or from walking up
 * from the entry script instead.
 * @returns Candidate manifest paths, in the order they should be tried.
 */
export declare function hostManifestCandidates(): string[];
/**
 * The running host's core version. Every `@deepseek-ai/dsh-*` package ships on
 * one version line, and `dsh-tools` is the one the host's install gate compares
 * peer ranges against, so that manifest answers for all of them.
 * @returns The version, or null when no host copy is locatable.
 */
export declare function dshRuntimeVersion(): string | null;
/**
 * The `@deepseek-ai/dsh-*` peer ranges a manifest declares.
 * @param manifest A package manifest.
 * @returns Ranges as written; empty when the package declares none.
 */
export declare function dshPeerRequirements(manifest: Record<string, unknown>): string[];
/**
 * The `engines.dsh` a manifest declares, in either accepted position.
 * @param manifest A package manifest.
 * @returns The range, or undefined when undeclared.
 */
export declare function dshEnginesDeclaration(manifest: Record<string, unknown>): string | undefined;
/**
 * Whether one range admits the running host.
 * @returns True/false, or null when either side makes the answer unknowable.
 */
export declare function rangeSatisfied(range: string, runtime: string | null): boolean | null;
/**
 * Reduce the peer ranges the host gates on.
 * @param peers Declared peer ranges.
 * @param runtime Running core version, or null.
 * @returns `unknown` when either side is missing or unparseable — never a guess.
 */
export declare function compatVerdict(peers: string[], runtime: string | null): CompatVerdict;
/** `owner/repo` from any GitHub spelling, lower-cased, or '' when not GitHub. */
export declare function normalizeGitHubRepository(value: unknown): string;
/**
 * Annotate one GitHub result. When the repository name and the npm package name
 * differ, the caller supplies the curated list's own mapping as `npmName`.
 * @param fullName GitHub `owner/repo` of the result.
 * @param npmName Curated npm package name, when the list knows one.
 * @param signal Caller cancellation.
 * @returns The finding; `unknown` whenever a manifest could not be established.
 */
export declare function annotateCompatibility(fullName: string, npmName?: string, signal?: AbortSignal): Promise<CompatFinding>;
/** A compact marker for the rendered list. */
export declare function compatMarker(finding: CompatFinding | undefined): string;
