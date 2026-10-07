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
export function profileFlag(env = process.env) {
    const configured = (env.DSH_PROFILE ?? '').trim();
    return configured.length > 0 ? configured : 'web';
}
/** A `dsh plugin add` command aimed at the profile this host is running. */
export function installCommand(spec, env) {
    return `dsh plugin --profile ${profileFlag(env)} add ${spec}`;
}
/** `--profile <name>` in either the spaced or the `=`-joined spelling. */
const PROFILE_FLAG = /--profile(?:=|\s+)(?<name>\S+)/u;
/**
 * Re-aim an install command that arrived from elsewhere — the curated list ships
 * its own `--profile web` strings — at the running profile, so a command copied
 * out of a result installs where the user is actually looking.
 * @param command The command as published upstream.
 * @param env Environment to read the profile from.
 * @returns The same command with its profile replaced, or added when absent.
 */
export function retargetInstallCommand(command, env) {
    const profile = profileFlag(env);
    if (PROFILE_FLAG.test(command))
        return command.replace(PROFILE_FLAG, `--profile ${profile}`);
    if (/^dsh\s+plugin\b/u.test(command))
        return command.replace(/^(dsh\s+plugin)\b/u, `$1 --profile ${profile}`);
    return command;
}
