/**
 * Host Git Remote owner: reads the branch one Session working directory has
 * checked out, lists its local branches, and switches between them over the
 * generated `git` namespace. Every command runs in that Session's sandbox
 * policy and execution world.
 * @module @deepseek-ai/dsh-client-ui-git-branch
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { Session } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-working-directory'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import { readBranchPosition, readLocalBranches, switchBranch } from './git.ts'
import type { GitLimits } from './git.ts'
import type { GitBranchValue, GitBranchesValue, GitCheckoutRequest, GitCheckoutValue } from './types.ts'

export type * from './types.ts'

/** Resolved defaults for the Git executable and its process limits. */
const DEFAULT_GIT_COMMAND = 'git'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_GRACE_MS = 2_000
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_MAX_BRANCHES = 200

/** Deployment limits for one Git command and one branch listing. */
export interface Config {
  /** Git executable name or absolute path (default `git`). */
  readonly gitCommand?: string
  /** Deadline in milliseconds for one command (default 10000). */
  readonly timeoutMs?: number
  /** Termination grace period in milliseconds for each process (default 2000). */
  readonly graceMs?: number
  /** Maximum captured bytes per output stream (default 65536). */
  readonly maxOutputBytes?: number
  /** Most local branch names one listing returns (default 200). */
  readonly maxBranches?: number
}

/** Host service backing the generated `ctx.remote.git` namespace. */
export class GitBranchService extends TypertRemoteService {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy', 'workingDirectory']

  static Config: z<Config> = z.object({
    gitCommand: z.string().default(DEFAULT_GIT_COMMAND),
    timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
    graceMs: z.natural().min(1).default(DEFAULT_GRACE_MS),
    maxOutputBytes: z.natural().min(1).default(DEFAULT_MAX_OUTPUT_BYTES),
    maxBranches: z.natural().min(1).default(DEFAULT_MAX_BRANCHES),
  })

  private readonly limits: GitLimits

  /**
   * @param ctx - Host context carrying the subprocess, sandbox, sandbox-policy, and working-directory services.
   * @param config - executable and process limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'gitController', { namespace: 'git' })
    // schemastery (the exported Config schema) has already filled the defaulted
    // fields; the assertion records that resolution, not a hidden fallback.
    const resolved = config as Required<Config>
    this.limits = {
      gitCommand: resolved.gitCommand,
      timeoutMs: resolved.timeoutMs,
      graceMs: resolved.graceMs,
      maxOutputBytes: resolved.maxOutputBytes,
      maxBranches: resolved.maxBranches,
    }
  }

  /**
   * Read the branch the Session's working directory has checked out.
   * @param session - Session whose working directory and sandbox policy apply.
   * @param signal - caller cancellation.
   * @returns the repository root, branch, and HEAD commit, or `none` outside a checkout.
   */
  @Remote
  async branch(session: Session, signal: AbortSignal): Promise<GitBranchValue> {
    return await readBranchPosition(this.ctx, this.limits, session, this.directory(session), signal)
  }

  /**
   * List the local branches of the Session's repository, the checked-out one first.
   * @param session - Session whose working directory and sandbox policy apply.
   * @param signal - caller cancellation.
   * @returns the checked-out branch and local branch names, or `none` outside a checkout.
   */
  @Remote
  async branches(session: Session, signal: AbortSignal): Promise<GitBranchesValue> {
    return await readLocalBranches(this.ctx, this.limits, session, this.directory(session), signal)
  }

  /**
   * Check out one local branch in the Session's repository.
   * @param session - Session whose working directory and sandbox policy apply.
   * @param request - the local branch to check out.
   * @param signal - caller cancellation.
   * @returns the new branch position, or why the switch did not happen.
   */
  @Remote
  async checkout(session: Session, request: GitCheckoutRequest, signal: AbortSignal): Promise<GitCheckoutValue> {
    return await switchBranch(this.ctx, this.limits, session, this.directory(session), request.branch, signal)
  }

  /** The Session's effective absolute working directory. */
  private directory(session: Session): string {
    return this.ctx.workingDirectory.get(session)
  }
}

export default GitBranchService
