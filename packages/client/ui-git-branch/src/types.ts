/**
 * Wire types of the generated `git` Remote namespace: one Session working
 * directory's branch position, its local branches, and a branch switch.
 * Client-safe: no Host imports.
 * @module @deepseek-ai/dsh-client-ui-git-branch/types
 */

/** Checked-out branch position of a directory inside a Git repository. */
export interface GitRepositoryBranch {
  readonly kind: 'repository'
  /** Absolute repository top-level directory. */
  readonly root: string
  /** Checked-out branch name; null while HEAD is detached. */
  readonly branch: string | null
  /** Abbreviated HEAD commit; null while the checked-out branch has no commit. */
  readonly commit: string | null
}

/** A directory outside any Git repository, or a checkout Git could not read. */
export interface GitNoRepository {
  readonly kind: 'none'
}

/** Result of reading one directory's branch position. */
export type GitBranchValue = GitRepositoryBranch | GitNoRepository

/** The local branches of one directory's repository, with its checked-out branch. */
export type GitBranchesValue =
  | {
    readonly kind: 'repository'
    /** Checked-out branch name; null while HEAD is detached. */
    readonly current: string | null
    /** Local branch names: the checked-out one first, then most recently committed first. */
    readonly branches: readonly string[]
  }
  | GitNoRepository

/** One branch a client asks to check out in the Session's working directory. */
export interface GitCheckoutRequest {
  /** Local branch name; it must exist as `refs/heads/<branch>`. */
  readonly branch: string
}

/** Why a branch switch did not happen. */
export type GitCheckoutFailure =
  /** No local branch holds that name. */
  | 'unknown-branch'
  /** Uncommitted changes would be overwritten by the switch. */
  | 'dirty'
  /** Git refused for another reason, such as the branch being checked out in another worktree. */
  | 'failed'

/** Result of one branch switch: the new position, or why nothing changed. */
export type GitCheckoutValue =
  | {
    readonly kind: 'switched'
    /** Branch now checked out; null when the switch landed on a detached HEAD. */
    readonly branch: string | null
    /** Abbreviated commit the branch now names; null for an unborn branch. */
    readonly commit: string | null
  }
  | {
    readonly kind: 'failed'
    readonly reason: GitCheckoutFailure
    /** Git's own one-line diagnostic, for display beside the localized reason. */
    readonly message: string
  }
