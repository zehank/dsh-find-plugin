/**
 * The `--profile` value an emitted install command must carry.
 *
 * Upstream hard-codes `web`, which is wrong on every other profile. DSH sets
 * `DSH_PROFILE` in the processes it starts, so the value the host is actually
 * running under is readable from the environment — and that is the only value
 * that installs where the user expects.
 *
 * The failure mode is silent, which is why it matters: `dsh plugin --profile web
 * add …` on a Desktop build does not error. The CLI *initialises* a profile
 * named `web` and installs there, so the command succeeds while leaving the
 * running application completely unchanged.
 */
/** The running profile, falling back to upstream's `web` when nothing is set. */
export declare function profileFlag(env?: Record<string, string | undefined>): string;
/** A `dsh plugin add` command aimed at the profile this host is running. */
export declare function installCommand(spec: string, env?: Record<string, string | undefined>): string;
/**
 * Re-aim an install command that arrived from elsewhere — the curated list ships
 * its own `--profile web` strings — at the running profile, so a command copied
 * out of a result installs where the user is actually looking.
 * @param command The command as published upstream.
 * @param env Environment to read the profile from.
 * @returns The same command with its profile replaced, or added when absent.
 */
export declare function retargetInstallCommand(command: string, env?: Record<string, string | undefined>): string;
