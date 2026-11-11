/**
 * Host Git Remote: branch position, local branch listing, and switches against
 * real repositories, with the sandbox policy and subprocess seam observed.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SandboxProvider from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import { Session as SessionRecord, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { readBranchPosition, readLocalBranches, switchBranch } from '../src/git.ts'
import type { GitLimits } from '../src/git.ts'

const execute = promisify(execFile)

/** Every confinement the recording sandbox observed. */
const confinements: { argv: readonly string[]; policy: SandboxPolicy }[] = []

/** A sandbox that records the policy and spawns the argv unchanged. */
class RecordingSandbox extends SandboxProvider {
  override async confine(argv: readonly string[], policy: SandboxPolicy): Promise<ConfinedArgv> {
    confinements.push({ argv, policy })
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

/** Limits used by every case; generous enough for fixture repositories. */
const LIMITS: GitLimits = {
  gitCommand: 'git',
  timeoutMs: 10_000,
  graceMs: 1_000,
  maxOutputBytes: 64 * 1024,
  maxBranches: 50,
}

const disposable: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const dispose of disposable.splice(0).reverse()) await dispose()
  confinements.length = 0
})

/** Run the real Git CLI for fixtures, isolated from the developer's configuration. */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execute('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '', GIT_CONFIG_PARAMETERS: '', GIT_CONFIG_COUNT: '0',
      GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined,
      GIT_AUTHOR_NAME: 'Git fixture', GIT_AUTHOR_EMAIL: 'git@example.invalid',
      GIT_COMMITTER_NAME: 'Git fixture', GIT_COMMITTER_EMAIL: 'git@example.invalid',
    },
  })
  return result.stdout.trim()
}

/** A temporary repository with one commit on main and a feature branch. */
async function repository(): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'git-branch-')))
  disposable.push(() => rm(directory, { recursive: true, force: true }))
  await git(directory, ['init', '-b', 'main'])
  await git(directory, ['config', 'core.autocrlf', 'false'])
  await writeFile(join(directory, 'tracked.txt'), 'initial\n')
  await git(directory, ['add', 'tracked.txt'])
  await git(directory, ['commit', '-m', 'initial'])
  await git(directory, ['branch', 'feature'])
  await git(directory, ['checkout', 'feature'])
  await writeFile(join(directory, 'feature.txt'), 'feature\n')
  await writeFile(join(directory, 'tracked.txt'), 'feature tracked\n')
  await git(directory, ['add', 'feature.txt', 'tracked.txt'])
  await git(directory, ['commit', '-m', 'feature'])
  await git(directory, ['checkout', 'main'])
  return directory
}

/** A temporary directory outside every checkout. */
async function plainDirectory(): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'git-branch-none-')))
  disposable.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

/** A context with a recording sandbox, the local subprocess runtime, and a workspace-write policy. */
async function context(root: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(RecordingSandbox)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: root })
  disposable.push(async () => { await ctx.fiber.dispose() })
  return ctx
}

/** A Session outside any store whose current directory is `cwd`. */
function session(cwd: string): Session {
  const id = SessionId('git-branch-fixture')
  return SessionRecord.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, isSeeded: false, cwd })
}

describe('readBranchPosition', () => {
  it('reports the checked-out branch and the repository root under the Session policy', async () => {
    const root = await repository()
    const ctx = await context(root)
    const position = await readBranchPosition(ctx, LIMITS, session(root), root, new AbortController().signal)
    expect(position).toMatchObject({ kind: 'repository', root, branch: 'main' })
    if (position.kind !== 'repository') throw new Error('expected a repository')
    expect(position.commit).toMatch(/^[0-9a-f]{7,}$/u)
    expect(confinements.length).toBeGreaterThan(0)
    for (const confinement of confinements) expect(confinement.policy.mode).toBe('workspace-write')
  })

  it('reports none outside a checkout', async () => {
    const root = await plainDirectory()
    const ctx = await context(root)
    await expect(readBranchPosition(ctx, LIMITS, session(root), root, new AbortController().signal))
      .resolves.toEqual({ kind: 'none' })
  })

  it('reports a detached HEAD as a commit without a branch', async () => {
    const root = await repository()
    await git(root, ['checkout', '--detach'])
    const ctx = await context(root)
    const position = await readBranchPosition(ctx, LIMITS, session(root), root, new AbortController().signal)
    expect(position).toMatchObject({ kind: 'repository', branch: null })
    if (position.kind !== 'repository') throw new Error('expected a repository')
    expect(position.commit).toMatch(/^[0-9a-f]{7,}$/u)
  })

  it('rejects when the caller cancels', async () => {
    const root = await repository()
    const ctx = await context(root)
    const lifetime = new AbortController()
    lifetime.abort(new Error('cancelled'))
    await expect(readBranchPosition(ctx, LIMITS, session(root), root, lifetime.signal)).rejects.toThrow()
  })
})

describe('readLocalBranches', () => {
  it('lists the checked-out branch first', async () => {
    const root = await repository()
    const ctx = await context(root)
    await expect(readLocalBranches(ctx, LIMITS, session(root), root, new AbortController().signal))
      .resolves.toEqual({ kind: 'repository', current: 'main', branches: ['main', 'feature'] })
  })

  it('caps the listing at maxBranches while keeping the checked-out branch', async () => {
    const root = await repository()
    for (const name of ['one', 'two', 'three']) await git(root, ['branch', name])
    const ctx = await context(root)
    const listed = await readLocalBranches(ctx, { ...LIMITS, maxBranches: 2 }, session(root), root, new AbortController().signal)
    expect(listed).toMatchObject({ kind: 'repository', current: 'main' })
    if (listed.kind !== 'repository') throw new Error('expected a repository')
    expect(listed.branches).toHaveLength(2)
    expect(listed.branches[0]).toBe('main')
  })

  it('reports none outside a checkout', async () => {
    const root = await plainDirectory()
    const ctx = await context(root)
    await expect(readLocalBranches(ctx, LIMITS, session(root), root, new AbortController().signal))
      .resolves.toEqual({ kind: 'none' })
  })
})

describe('switchBranch', () => {
  it('checks out a local branch and reports the new position', async () => {
    const root = await repository()
    const ctx = await context(root)
    await expect(switchBranch(ctx, LIMITS, session(root), root, 'feature', new AbortController().signal))
      .resolves.toMatchObject({ kind: 'switched', branch: 'feature' })
    expect(await git(root, ['symbolic-ref', '--short', 'HEAD'])).toBe('feature')
  })

  it('refuses an unknown branch without running a switch', async () => {
    const root = await repository()
    const ctx = await context(root)
    await expect(switchBranch(ctx, LIMITS, session(root), root, 'missing', new AbortController().signal))
      .resolves.toMatchObject({ kind: 'failed', reason: 'unknown-branch' })
    expect(await git(root, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')
  })

  it('refuses a name Git could read as an option', async () => {
    const root = await repository()
    const ctx = await context(root)
    await expect(switchBranch(ctx, LIMITS, session(root), root, '-x', new AbortController().signal))
      .resolves.toMatchObject({ kind: 'failed', reason: 'unknown-branch' })
  })

  it('refuses to overwrite uncommitted changes', async () => {
    const root = await repository()
    await writeFile(join(root, 'tracked.txt'), 'modified\n')
    const ctx = await context(root)
    const result = await switchBranch(ctx, LIMITS, session(root), root, 'feature', new AbortController().signal)
    expect(result).toMatchObject({ kind: 'failed', reason: 'dirty' })
    expect(await git(root, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')
  })
})
