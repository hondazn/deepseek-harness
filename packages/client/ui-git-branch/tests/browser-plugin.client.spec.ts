/**
 * ui-git-branch plugin halves: the browser entry's dictionaries and header-slot
 * registration against the real SlotRegistry (with fiber teardown proving
 * removal — HMR safety), and the inject face's Remote unwrapping.
 */
import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import type { GitBranchInjected } from '../src/client/GitBranchAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'
import type { GitBranchValue, GitBranchesValue, GitCheckoutValue } from '../src/types.ts'

const REPOSITORY: GitBranchValue = { kind: 'repository', root: '/w', branch: 'main', commit: 'abc1234' }
const BRANCHES: GitBranchesValue = { kind: 'repository', current: 'main', branches: ['main', 'feature'] }
const SWITCHED: GitCheckoutValue = { kind: 'switched', branch: 'feature', commit: 'def5678' }

/** Calls the fake Remote face received. */
const calls: string[] = []
/** Whether the fake branch read fails. */
let failBranch = false

/** The fake `remote.git` namespace, as the generated Client face resolves it. */
const gitRemote = {
  branch: async (sessionId: string) => {
    calls.push('branch:' + sessionId)
    return failBranch ? { ok: false, error: { message: 'unavailable' } } : { ok: true, value: REPOSITORY }
  },
  branches: async (sessionId: string) => {
    calls.push('branches:' + sessionId)
    return { ok: true, value: BRANCHES }
  },
  checkout: async (sessionId: string, request: { branch: string }) => {
    calls.push('checkout:' + sessionId + ':' + request.branch)
    return { ok: true, value: SWITCHED }
  },
}

/** Slot ledger reader: entry ids currently registered in the header list. */
function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.session.header.actions').map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the header list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('remote', { git: gitRemote, $on: () => () => {} } as never)
  ctx.provide('remote.git', gitRemote as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

/** The registered inject face of the header action. */
function injectFace(ctx: Context): GitBranchInjected {
  const entry = ctx.slots.entries('conversation.session.header.actions')
    .find(candidate => candidate.options.id === 'git-branch')
  const create = entry?.inject as (() => GitBranchInjected) | undefined
  if (create === undefined) throw new Error('git-branch entry registered no inject face')
  return create()
}

describe('ui-git-branch browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['remote', 'remote.git', 'slots', 'locale'])
  })

  it('forwards the Remote results through the inject face', async () => {
    const { ctx } = await bench()
    const face = injectFace(ctx)
    const signal = new AbortController().signal
    const sessionId = SessionId('session')
    await expect(face.loadBranch(sessionId, signal)).resolves.toEqual(REPOSITORY)
    await expect(face.loadBranches(sessionId, signal)).resolves.toEqual(BRANCHES)
    await expect(face.checkout(sessionId, 'feature', signal)).resolves.toEqual(SWITCHED)
    expect(calls).toEqual(['branch:session', 'branches:session', 'checkout:session:feature'])
  })

  it('rejects when the Remote reports a failure', async () => {
    const { ctx } = await bench()
    failBranch = true
    try {
      await expect(injectFace(ctx).loadBranch(SessionId('session'), new AbortController().signal))
        .rejects.toThrow('unavailable')
    } finally {
      failBranch = false
    }
  })

  it('registers the header action, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(headerEntryIds(ctx)).toContain('git-branch')
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('git-branch')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('menu.title')).toBe(zh['menu.title'])
    ctx.locale.setLocale('en')
    expect(translate('menu.title')).toBe(en['menu.title'])
    await fiber.dispose()
    expect(translate('menu.title')).not.toBe(en['menu.title'])
  })

  it('keeps every dictionary key-identical to the Chinese source of truth', async () => {
    const { de, es, fr, ja, pt, ru } = await import('../src/client/locales.ts')
    for (const dictionary of [en, ja, es, fr, de, ru, pt]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(zh).sort())
    }
  })
})
