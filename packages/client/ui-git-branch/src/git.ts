/** Git branch reads and switches in one Session working directory, under its sandbox policy. */

import type { Context } from '@deepseek-ai/cordis'
import type { ConfinedSandboxMode, SandboxExecutionPolicy, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SubprocessCollectedOutputs } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { GitBranchValue, GitBranchesValue, GitCheckoutFailure, GitCheckoutValue } from './types.ts'

/** Resolved Git executable and process limits. */
export interface GitLimits {
  /** Git executable name or absolute path. */
  readonly gitCommand: string
  /** Deadline in milliseconds for one command, including executable lookup and confinement. */
  readonly timeoutMs: number
  /** Termination grace period in milliseconds for each process. */
  readonly graceMs: number
  /** Maximum captured bytes per output stream. */
  readonly maxOutputBytes: number
  /** Most local branch names one listing returns. */
  readonly maxBranches: number
}

/** Complete output of one Git command that exited with an allowed code. */
interface GitOutput {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** Runs one Git subcommand; output with an exit code outside `allowedExitCodes` throws. */
type GitRun = (name: string, args: readonly string[], allowedExitCodes: readonly number[]) => Promise<GitOutput>

/** Where and how one repository's commands run: Session policy, directory, limits, and cancellation. */
interface GitTarget {
  readonly ctx: Context
  readonly limits: GitLimits
  readonly policy: SandboxExecutionPolicy
  readonly directory: string
  readonly signal: AbortSignal
}

/**
 * Clear inherited repository, configuration, and replacement-ref selectors;
 * disable prompts, optional index writes, and lazy fetches of missing objects.
 */
const GIT_ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries([
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
    'GIT_CEILING_DIRECTORIES', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE',
    'GIT_REPLACE_REF_BASE', 'GIT_ATTR_SOURCE',
  ].map(key => [key, undefined])),
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_NO_LAZY_FETCH: '1',
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
}

/** Arguments before every subcommand: no index refresh writes, hooks, or filesystem monitor. */
const GIT_PREFIX = ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'] as const

/** Git's stderr when the directory is outside every checkout. */
const NOT_A_CHECKOUT = /not a git repository|must be run in a work tree/i

/** Longest branch name Git accepts: the ref-name limit applies to the whole `refs/heads/` path. */
const MAX_BRANCH_NAME = 255

/**
 * Read the checkout containing `directory` and its checked-out branch.
 * @param ctx - context that provides `subprocess`, `sandbox`, and `sandboxPolicy`.
 * @param limits - executable and process limits.
 * @param session - Session whose sandbox policy and execution world apply.
 * @param directory - absolute directory to inspect.
 * @param signal - cancellation of every command.
 * @returns the repository root, branch, and HEAD commit, or `none` outside a checkout.
 * @throws when Git cannot run, fails unexpectedly, times out, or prints more than `maxOutputBytes`.
 */
export async function readBranchPosition(
  ctx: Context,
  limits: GitLimits,
  session: Session,
  directory: string,
  signal: AbortSignal,
): Promise<GitBranchValue> {
  return await readPosition(gitIn(ctx, limits, session, directory, signal))
}

/**
 * Read the position through an already-bound runner.
 * @param git - runner bound to one directory and Session policy.
 * @returns the repository root, branch, and HEAD commit, or `none` outside a checkout.
 * @throws when Git cannot run, fails unexpectedly, times out, or prints more than the output cap.
 */
async function readPosition(git: GitRun): Promise<GitBranchValue> {
  const top = await git('rev-parse', ['rev-parse', '--show-toplevel'], [0, 128])
  if (top.exitCode !== 0) {
    if (NOT_A_CHECKOUT.test(top.stderr)) return { kind: 'none' }
    throw new Error(`git rev-parse failed: ${firstLine(top.stderr)}`)
  }
  const root = firstNonEmptyLine(top.stdout)
  if (root === null) throw new Error('git rev-parse printed no directory')
  const head = await git('symbolic-ref', ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1])
  const branch = head.exitCode === 0 ? firstNonEmptyLine(head.stdout) : null
  const short = await git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128])
  return { kind: 'repository', root, branch, commit: short.exitCode === 0 ? firstNonEmptyLine(short.stdout) : null }
}

/**
 * List the local branches of the checkout containing `directory`, checked-out one first.
 * @param ctx - context that provides `subprocess`, `sandbox`, and `sandboxPolicy`.
 * @param limits - executable and process limits.
 * @param session - Session whose sandbox policy and execution world apply.
 * @param directory - absolute directory to inspect.
 * @param signal - cancellation of every command.
 * @returns the checked-out branch and at most `maxBranches` local branch names, or `none` outside a checkout.
 * @throws when Git cannot run, fails, times out, or prints more than `maxOutputBytes`.
 */
export async function readLocalBranches(
  ctx: Context,
  limits: GitLimits,
  session: Session,
  directory: string,
  signal: AbortSignal,
): Promise<GitBranchesValue> {
  const git = gitIn(ctx, limits, session, directory, signal)
  const position = await readPosition(git)
  if (position.kind === 'none') return { kind: 'none' }
  const refs = await git('for-each-ref', [
    'for-each-ref', '--sort=-committerdate', `--count=${limits.maxBranches}`, '--format=%(refname:lstrip=2)', 'refs/heads/',
  ], [0])
  const listed = refs.stdout.split(/\r?\n/).map(name => name.trim()).filter(name => name.length > 0)
  const current = position.branch
  const branches = current === null ? listed : [current, ...listed.filter(name => name !== current)]
  return { kind: 'repository', current, branches: branches.slice(0, limits.maxBranches) }
}

/**
 * Check out one local branch of the checkout containing `directory`.
 * @param ctx - context that provides `subprocess`, `sandbox`, and `sandboxPolicy`.
 * @param limits - executable and process limits.
 * @param session - Session whose sandbox policy and execution world apply.
 * @param directory - absolute directory whose repository to switch.
 * @param branch - local branch name to check out.
 * @param signal - cancellation of every command.
 * @returns the new branch position, or why the switch did not happen.
 * @throws when Git cannot run, fails unexpectedly, times out, or prints more than `maxOutputBytes`.
 */
export async function switchBranch(
  ctx: Context,
  limits: GitLimits,
  session: Session,
  directory: string,
  branch: string,
  signal: AbortSignal,
): Promise<GitCheckoutValue> {
  if (branch.length === 0 || branch.length > MAX_BRANCH_NAME || branch.startsWith('-')) {
    return { kind: 'failed', reason: 'unknown-branch', message: branch }
  }
  const git = gitIn(ctx, limits, session, directory, signal)
  const exists = await git('show-ref', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], [0, 1])
  if (exists.exitCode !== 0) return { kind: 'failed', reason: 'unknown-branch', message: branch }
  const switched = await git('switch', ['switch', branch], [0, 1, 128])
  if (switched.exitCode !== 0) {
    return { kind: 'failed', reason: refusalReason(switched.stderr), message: firstLine(switched.stderr) }
  }
  const position = await readPosition(git)
  return {
    kind: 'switched',
    branch: position.kind === 'repository' ? position.branch : null,
    commit: position.kind === 'repository' ? position.commit : null,
  }
}

/** Classify a refused switch: uncommitted work Git declined to overwrite, or another refusal. */
function refusalReason(stderr: string): GitCheckoutFailure {
  return /would be overwritten|local changes|commit your changes|stash them/i.test(stderr) ? 'dirty' : 'failed'
}

/**
 * Bind the Git runner to one Session and directory: every command runs under
 * the Session's sandbox policy with the scrubbed environment and `limits`.
 */
function gitIn(ctx: Context, limits: GitLimits, session: Session, directory: string, signal: AbortSignal): GitRun {
  const target: GitTarget = {
    ctx,
    limits,
    policy: ctx.sandboxPolicy.resolve({ session }),
    directory,
    signal,
  }
  return (name, args, allowedExitCodes) => runGit(target, name, args, allowedExitCodes)
}

async function runGit(
  target: GitTarget,
  name: string,
  args: readonly string[],
  allowedExitCodes: readonly number[],
): Promise<GitOutput> {
  const { ctx, limits, policy, directory, signal } = target
  const timeout = AbortSignal.timeout(limits.timeoutMs)
  const lifetime = AbortSignal.any([signal, timeout])
  const program = await ctx.subprocess.resolveExecutable(limits.gitCommand, undefined, lifetime)
  const command = [program, ...GIT_PREFIX, ...args]
  const argv = policy.mode === 'danger-full-access'
    ? command
    : (await ctx.sandbox.confine(command, confinedPolicy(policy, policy.mode), lifetime)).argv
  lifetime.throwIfAborted()
  const child = ctx.subprocess.spawn({
    argv,
    cwd: directory,
    env: GIT_ENV,
    signal: lifetime,
    graceMs: limits.graceMs,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: limits.maxOutputBytes },
      stderr: { maxBytes: limits.maxOutputBytes },
    },
  })
  try {
    const outcome = await child.done
    lifetime.throwIfAborted()
    // The spawn spec above collects both streams.
    const captured = child.collected as Required<SubprocessCollectedOutputs>
    const stdout = captured.stdout.readFrom(0)
    const stderr = captured.stderr.readFrom(0)
    if (outcome.exitCode === null || !allowedExitCodes.includes(outcome.exitCode)) {
      throw new Error(`git ${name} failed (${outcome.signal ?? outcome.exitCode}): ${firstLine(stderr.text)}`)
    }
    if (stdout.lossy || stderr.lossy) throw new Error(`git ${name} output exceeds ${limits.maxOutputBytes} bytes`)
    return { stdout: stdout.text, stderr: stderr.text, exitCode: outcome.exitCode }
  } finally {
    child.terminate()
    await child.waitForExit()
  }
}

/** Restate a resolved policy as the confining form `confine` accepts. */
function confinedPolicy(policy: SandboxExecutionPolicy, mode: ConfinedSandboxMode): SandboxPolicy {
  return {
    mode,
    workspaceRoot: policy.workspaceRoot,
    ...policy.additionalWritableRoots === undefined ? {} : { additionalWritableRoots: policy.additionalWritableRoots },
    ...policy.sessionId === undefined ? {} : { sessionId: policy.sessionId },
  }
}

/** The first non-empty line, trimmed, or null when every line is blank. */
function firstNonEmptyLine(text: string): string | null {
  return text.split(/\r?\n/).map(line => line.trim()).find(line => line.length > 0) ?? null
}

/** The first non-empty line, trimmed, for a one-line diagnostic. */
function firstLine(text: string): string {
  return firstNonEmptyLine(text) ?? 'no diagnostic'
}
