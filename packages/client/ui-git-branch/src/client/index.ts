/**
 * Session-header Git branch chip, browser half: one header action over the
 * generated `git` Remote namespace, with the branch switcher in its menu.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Merges the selected Remote namespaces, including this package's `git`.
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { GitBranchAction } from './GitBranchAction.tsx'
import type { GitBranchInjected } from './GitBranchAction.tsx'
import { NS, de, en, es, fr, ja, pt, ru, zh } from './locales.ts'

export type { GitBranchActionProps, GitBranchInjected } from './GitBranchAction.tsx'

/** Required services: the Remote carrier and its `git` namespace, the slot registry, and dictionaries. */
export const inject = ['remote', 'remote.git', 'slots', 'locale']

/**
 * Unwrap one Remote result, turning its failure branch into a rejection the
 * component's catch treats like an unavailable repository.
 * @param result - the Remote result to read.
 * @returns the business value.
 * @throws when the call failed.
 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * Client plugin body: register the dictionaries and the header branch chip.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-git-branch: dictionaries')
  // Read the namespace now, not inside a callback: the call runs on a React
  // stack whose dynamic context never declared `remote.git`.
  const { git } = ctx.remote
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'git-branch',
    // Session context: after the preset label's leading band and before the
    // trailing job list.
    order: 0,
    locale: NS,
    inject: (): GitBranchInjected => ({
      loadBranch: async (sessionId, signal) => unwrap(await git.branch(sessionId, signal)),
      loadBranches: async (sessionId, signal) => unwrap(await git.branches(sessionId, signal)),
      checkout: async (sessionId, branch, signal) => unwrap(await git.checkout(sessionId, { branch }, signal)),
    }),
  }, GitBranchAction))
}
