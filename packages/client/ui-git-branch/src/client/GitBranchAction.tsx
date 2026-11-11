/** Session-header Git branch chip and branch switcher over the generated `git` Remote namespace. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconBranchOutlineRegular, IconChevronDownOutlineRegular, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GitBranchValue, GitBranchesValue, GitCheckoutValue } from '@deepseek-ai/dsh-client-ui-git-branch/types'
import type { NS } from './locales.ts'
import css from './GitBranchAction.module.css'

/** Registration-side business face of the branch chip. */
export interface GitBranchInjected {
  /**
   * Read the branch one Session working directory has checked out.
   * @param sessionId - Session whose working directory to inspect.
   * @param signal - cancellation of the call.
   * @returns the repository position, or `none` outside a checkout.
   */
  readonly loadBranch: (sessionId: SessionId, signal: AbortSignal) => Promise<GitBranchValue>
  /**
   * List the local branches of one Session's repository.
   * @param sessionId - Session whose repository to inspect.
   * @param signal - cancellation of the call.
   * @returns the checked-out branch and the local branches, or `none` outside a checkout.
   */
  readonly loadBranches: (sessionId: SessionId, signal: AbortSignal) => Promise<GitBranchesValue>
  /**
   * Check out one local branch in the Session's repository.
   * @param sessionId - Session whose repository to switch.
   * @param branch - local branch name to check out.
   * @param signal - cancellation of the call.
   * @returns the new position, or why the switch did not happen.
   */
  readonly checkout: (sessionId: SessionId, branch: string, signal: AbortSignal) => Promise<GitCheckoutValue>
}

/** Full props of the session-header branch chip. */
export type GitBranchActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & InjectFace<GitBranchInjected>

type Translate = GitBranchActionProps['t']

/** What the chip shows: hidden outside a checkout, otherwise the read position. */
type PositionState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'hidden' }
  | { readonly phase: 'ready'; readonly value: Extract<GitBranchValue, { kind: 'repository' }> }

interface MenuState {
  readonly open: boolean
  readonly loading: boolean
  readonly branches: readonly string[]
  readonly error: string | null
}

const CLOSED_MENU: MenuState = { open: false, loading: false, branches: [], error: null }

/**
 * Localized explanation for a refused switch.
 * @param result - the failed switch result.
 * @param branch - branch the user asked for.
 * @param t - the plugin's dictionary.
 * @returns copy naming the cause without repeating a message already shown.
 */
function failureText(result: Extract<GitCheckoutValue, { kind: 'failed' }>, branch: string, t: Translate): string {
  if (result.reason === 'unknown-branch') return t('error.unknownBranch', { branch })
  if (result.reason === 'dirty') return t('error.dirty')
  return t('error.failed', { message: result.message })
}

/**
 * Render the branch the Session's working directory has checked out beside its
 * title, and switch it from the chip's menu. Nothing renders outside a Git
 * checkout or while the first read is in flight.
 * @param props - composed slot props.
 * @returns the branch chip with its menu, or null when the directory is outside a checkout.
 */
export function GitBranchAction({
  sessionId, useSessions, loadBranch, loadBranches, checkout, t,
}: GitBranchActionProps): ReactNode {
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const [position, setPosition] = useState<PositionState>({ phase: 'loading' })
  const [menu, setMenu] = useState<MenuState>(CLOSED_MENU)
  const [busy, setBusy] = useState<string | null>(null)
  const listLifetime = useRef<AbortController | null>(null)
  const switchLifetime = useRef<AbortController | null>(null)

  // Re-read when the Session or its workspace directory changes: both move the
  // repository whose branch the chip names.
  useEffect(() => {
    const lifetime = new AbortController()
    let current = true
    void loadBranch(sessionId, lifetime.signal)
      .then((value) => {
        if (!current) return
        setPosition(value.kind === 'repository' ? { phase: 'ready', value } : { phase: 'hidden' })
      })
      .catch(() => { if (current) setPosition({ phase: 'hidden' }) })
    return () => {
      current = false
      lifetime.abort()
    }
  }, [sessionId, cwd, loadBranch])

  useEffect(() => () => {
    listLifetime.current?.abort()
    switchLifetime.current?.abort()
  }, [])

  const closeMenu = useCallback((): void => {
    listLifetime.current?.abort()
    listLifetime.current = null
    setMenu(CLOSED_MENU)
  }, [])

  const toggleMenu = (): void => {
    if (menu.open) {
      closeMenu()
      return
    }
    listLifetime.current?.abort()
    const lifetime = new AbortController()
    listLifetime.current = lifetime
    setMenu({ open: true, loading: true, branches: [], error: null })
    void loadBranches(sessionId, lifetime.signal)
      .then((value) => {
        if (lifetime.signal.aborted) return
        setMenu(current => current.open
          ? { open: true, loading: false, branches: value.kind === 'repository' ? value.branches : [], error: null }
          : current)
      })
      .catch(() => {
        if (lifetime.signal.aborted) return
        setMenu(current => current.open
          ? { open: true, loading: false, branches: [], error: t('error.branches') }
          : current)
      })
  }

  const choose = (branch: string): void => {
    if (branch === positionValue(position)?.branch) {
      closeMenu()
      return
    }
    switchLifetime.current?.abort()
    const lifetime = new AbortController()
    switchLifetime.current = lifetime
    setBusy(branch)
    void checkout(sessionId, branch, lifetime.signal)
      .then((result) => {
        if (lifetime.signal.aborted) return
        setBusy(null)
        if (result.kind === 'switched') {
          setPosition(current => current.phase === 'ready'
            ? { phase: 'ready', value: { ...current.value, branch: result.branch, commit: result.commit } }
            : current)
          closeMenu()
          return
        }
        setMenu(current => current.open ? { ...current, loading: false, error: failureText(result, branch, t) } : current)
      })
      .catch(() => {
        if (lifetime.signal.aborted) return
        setBusy(null)
        setMenu(current => current.open ? { ...current, loading: false, error: t('error.failed', { message: '' }) } : current)
      })
  }

  const value = positionValue(position)
  if (value === null) return null
  const branch = value.branch
  const label = branch ?? value.commit ?? t('chip.detached')
  const tip = branch === null
    ? t('chip.detachedTooltip', { commit: value.commit ?? '' })
    : t('chip.tooltip', { branch })
  const aria = branch === null
    ? t('chip.detachedAria', { commit: value.commit ?? '' })
    : t('chip.aria', { branch })
  const items: MenuEntry[] = [
    { type: 'label', id: 'title', text: t('menu.title') },
    ...menu.error === null ? [] : [{ id: 'error', label: menu.error, disabled: true, danger: true } as const],
    ...menu.loading
      ? [{ id: 'loading', label: t('menu.loading'), disabled: true } as const]
      : menu.branches.length === 0
        ? [{ id: 'empty', label: t('menu.empty'), disabled: true } as const]
        : menu.branches.map(name => ({
          id: name,
          label: name,
          disabled: busy !== null,
          ...busy === null ? {} : { disabledReason: t('menu.busy') },
        })),
  ]
  return (
    <span className={css.root} data-git-branch="">
      <Menu
        open={menu.open}
        items={items}
        selectedId={branch ?? undefined}
        onSelect={choose}
        onClose={closeMenu}
        side="bottom"
        align="start"
        portal
        anchor={(
          <Tooltip label={tip} side="bottom" portal>
            <button
              type="button"
              className={clsx(css.chip, menu.open && css.chipOpen)}
              aria-label={aria}
              aria-haspopup="menu"
              aria-expanded={menu.open}
              onClick={toggleMenu}
              data-git-branch-chip=""
            >
              <IconBranchOutlineRegular size={14} className={css.icon} />
              <span className={css.name}>{label}</span>
              <IconChevronDownOutlineRegular size={12} className={clsx(css.chevron, menu.open && css.chevronOpen)} />
            </button>
          </Tooltip>
        )}
      />
    </span>
  )
}

/** The read repository position, or null while hidden, loading, or outside a checkout. */
function positionValue(position: PositionState): Extract<GitBranchValue, { kind: 'repository' }> | null {
  return position.phase === 'ready' ? position.value : null
}
