// @vitest-environment jsdom
/**
 * Session-header Git branch chip: the read branch, its menu, and the switch
 * feedback around the injected Remote face.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GitBranchValue, GitBranchesValue, GitCheckoutValue } from '../src/types.ts'
import { GitBranchAction, type GitBranchActionProps } from '../src/client/GitBranchAction.tsx'
import { zh } from '../src/client/locales.ts'

beforeEach(() => {
  class TooltipObserver implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      const size = { inlineSize: 160, blockSize: 30 }
      this.callback([{
        target, borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size], contentRect: new DOMRect(),
      }], this)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', TooltipObserver)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  vi.stubGlobal('CSS', { supports: (property: string) => property === '-webkit-backdrop-filter' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const SESSION = 'session' as SessionId
const t: GitBranchActionProps['t'] = makeTranslate(zh)

const REPOSITORY: Extract<GitBranchValue, { kind: 'repository' }> = {
  kind: 'repository', root: '/w', branch: 'main', commit: 'abc1234',
}

/** Props with a scripted Remote face over one Session whose directory is `/w`. */
function props(over: Partial<GitBranchActionProps> = {}): GitBranchActionProps {
  function useSessions<T>(select: (state: { byId: Record<string, { cwd?: string }> }) => T): T {
    return select({ byId: { [SESSION]: { cwd: '/w' } } })
  }
  return {
    sessionId: SESSION,
    useSessions,
    loadBranch: async () => REPOSITORY,
    loadBranches: async (): Promise<GitBranchesValue> => ({ kind: 'repository', current: 'main', branches: ['main', 'feature'] }),
    checkout: async (): Promise<GitCheckoutValue> => ({ kind: 'switched', branch: 'feature', commit: 'def5678' }),
    t,
    ...over,
  } as GitBranchActionProps
}

/** Wait for the first branch read to paint the chip. */
async function chip(): Promise<HTMLElement> {
  return await screen.findByRole('button', { name: 'Git 分支：main' })
}

describe('GitBranchAction', () => {
  it('renders nothing outside a checkout', async () => {
    render(<GitBranchAction {...props({ loadBranch: async () => ({ kind: 'none' }) })} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: /Git 分支/u })).toBeNull()
  })

  it('renders nothing when the branch cannot be read', async () => {
    render(<GitBranchAction {...props({ loadBranch: async () => { throw new Error('unavailable') } })} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: /Git 分支/u })).toBeNull()
  })

  it('names the checked-out branch and offers the local branches', async () => {
    render(<GitBranchAction {...props()} />)
    fireEvent.click(await chip())
    expect(await screen.findByRole('menuitem', { name: 'feature' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'main' })).toBeDefined()
  })

  it('switches the branch and shows the new name', async () => {
    const checkout = vi.fn(async (): Promise<GitCheckoutValue> => ({ kind: 'switched', branch: 'feature', commit: 'def5678' }))
    render(<GitBranchAction {...props({ checkout })} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature' }))
    expect(checkout).toHaveBeenCalledWith(SESSION, 'feature', expect.any(AbortSignal))
    expect(await screen.findByRole('button', { name: 'Git 分支：feature' })).toBeDefined()
  })

  it('reports a refused switch in the menu and keeps the current branch', async () => {
    const checkout = vi.fn(async (): Promise<GitCheckoutValue> => ({ kind: 'failed', reason: 'dirty', message: 'local changes' }))
    render(<GitBranchAction {...props({ checkout })} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature' }))
    expect(await screen.findByText(zh['error.dirty'])).toBeDefined()
    expect(screen.getByRole('button', { name: 'Git 分支：main' })).toBeDefined()
  })

  it('reports an unknown local branch in the menu', async () => {
    const checkout = vi.fn(async (): Promise<GitCheckoutValue> => ({ kind: 'failed', reason: 'unknown-branch', message: 'gone' }))
    render(<GitBranchAction {...props({ checkout })} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature' }))
    expect(await screen.findByText('没有名为 feature 的本地分支')).toBeDefined()
  })

  it('reports a generic refusal with Git`s own diagnostic', async () => {
    const checkout = vi.fn(async (): Promise<GitCheckoutValue> => ({ kind: 'failed', reason: 'failed', message: 'in use by worktree' }))
    render(<GitBranchAction {...props({ checkout })} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature' }))
    expect(await screen.findByText('Git 拒绝了切换：in use by worktree')).toBeDefined()
  })

  it('reports a rejected checkout call and stays on the current branch', async () => {
    const checkout = vi.fn(async (): Promise<GitCheckoutValue> => { throw new Error('carrier failed') })
    render(<GitBranchAction {...props({ checkout })} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature' }))
    expect(await screen.findByText('Git 拒绝了切换：')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Git 分支：main' })).toBeDefined()
  })

  it('reports a failed listing in the menu', async () => {
    render(<GitBranchAction {...props({ loadBranches: async () => { throw new Error('unavailable') } })} />)
    fireEvent.click(await chip())
    expect(await screen.findByText(zh['error.branches'])).toBeDefined()
  })

  it('shows an empty listing message when the repository has no branches', async () => {
    render(<GitBranchAction {...props({
      loadBranches: async (): Promise<GitBranchesValue> => ({ kind: 'repository', current: null, branches: [] }),
    })} />)
    fireEvent.click(await chip())
    expect(await screen.findByText(zh['menu.empty'])).toBeDefined()
  })

  it('names a detached HEAD by its commit', async () => {
    render(<GitBranchAction {...props({
      loadBranch: async (): Promise<GitBranchValue> => ({ kind: 'repository', root: '/w', branch: null, commit: 'abc1234' }),
    })} />)
    const button = await screen.findByRole('button', { name: '分离头指针：abc1234' })
    expect(button.textContent).toContain('abc1234')
  })

  it('closes the menu when the checked-out branch is chosen again', async () => {
    render(<GitBranchAction {...props()} />)
    fireEvent.click(await chip())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'main' }))
    expect(screen.queryByRole('menuitem', { name: 'feature' })).toBeNull()
  })

  it('closes the menu on Escape', async () => {
    render(<GitBranchAction {...props()} />)
    fireEvent.click(await chip())
    expect(await screen.findByRole('menuitem', { name: 'feature' })).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'feature' })).toBeNull()
  })
})
