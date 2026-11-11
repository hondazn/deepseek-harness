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

/** One repository position the chip can show. */
type RepositoryPosition = Extract<GitBranchValue, { kind: 'repository' }>

/** What the chip shows: hidden outside a checkout, otherwise the read position. */
type PositionState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'hidden' }
  | { readonly phase: 'ready'; readonly value: RepositoryPosition }

/**
 * What the open menu shows. The contents are exhaustive, so loading, a failed
 * listing, and an empty branch list can never be shown together.
 */
type MenuState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'branches'; readonly names: readonly string[]; readonly error: string | null }
  | { readonly kind: 'unavailable'; readonly message: string }

const CLOSED_MENU: MenuState = { kind: 'closed' }

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
 * Chip text, tooltip, and accessible name for one position.
 * @param value - the read repository position.
 * @param t - the plugin's dictionary.
 * @returns the visible branch or commit name, its tooltip, and its accessible name.
 */
function chipCopy(value: RepositoryPosition, t: Translate): { label: string; tip: string; aria: string } {
  if (value.branch !== null) {
    return {
      label: value.branch,
      tip: t('chip.tooltip', { branch: value.branch }),
      aria: t('chip.aria', { branch: value.branch }),
    }
  }
  const commit = value.commit ?? ''
  return {
    label: value.commit ?? t('chip.detached'),
    tip: t('chip.detachedTooltip', { commit }),
    aria: t('chip.detachedAria', { commit }),
  }
}

/**
 * Menu rows for one menu state. Only a successfully read empty list claims an
 * empty repository; a failed listing shows its reason alone.
 * @param menu - the open menu's content.
 * @param switching - branch being checked out, or null while idle.
 * @param t - the plugin's dictionary.
 * @returns the title row followed by the state's own rows.
 */
function menuItems(menu: MenuState, switching: string | null, t: Translate): MenuEntry[] {
  if (menu.kind === 'closed') return []
  const items: MenuEntry[] = [{ type: 'label', id: 'title', text: t('menu.title') }]
  if (menu.kind === 'loading') return [...items, { id: 'loading', label: t('menu.loading'), disabled: true }]
  if (menu.kind === 'unavailable') return [...items, { id: 'error', label: menu.message, disabled: true, danger: true }]
  if (menu.error !== null) items.push({ id: 'error', label: menu.error, disabled: true, danger: true })
  if (menu.names.length === 0) {
    items.push({ id: 'empty', label: t('menu.empty'), disabled: true })
    return items
  }
  for (const name of menu.names) {
    items.push({
      id: name,
      label: name,
      disabled: switching !== null,
      ...switching === null ? {} : { disabledReason: t('menu.busy') },
    })
  }
  return items
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
  const [switching, setSwitching] = useState<string | null>(null)
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
    if (menu.kind !== 'closed') {
      closeMenu()
      return
    }
    listLifetime.current?.abort()
    const lifetime = new AbortController()
    listLifetime.current = lifetime
    setMenu({ kind: 'loading' })
    void loadBranches(sessionId, lifetime.signal)
      .then((value) => {
        if (lifetime.signal.aborted) return
        setMenu(current => current.kind === 'loading'
          ? { kind: 'branches', names: value.kind === 'repository' ? value.branches : [], error: null }
          : current)
      })
      .catch(() => {
        if (lifetime.signal.aborted) return
        setMenu(current => current.kind === 'loading'
          ? { kind: 'unavailable', message: t('error.branches') }
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
    setSwitching(branch)
    void checkout(sessionId, branch, lifetime.signal)
      .then((result) => {
        if (lifetime.signal.aborted) return
        setSwitching(null)
        if (result.kind === 'switched') {
          setPosition(current => current.phase === 'ready'
            ? { phase: 'ready', value: { ...current.value, branch: result.branch, commit: result.commit } }
            : current)
          closeMenu()
          return
        }
        setMenu(current => current.kind === 'branches'
          ? { ...current, error: failureText(result, branch, t) }
          : current)
      })
      .catch(() => {
        if (lifetime.signal.aborted) return
        setSwitching(null)
        setMenu(current => current.kind === 'branches'
          ? { ...current, error: t('error.failed', { message: '' }) }
          : current)
      })
  }

  const value = positionValue(position)
  if (value === null) return null
  const copy = chipCopy(value, t)
  const open = menu.kind !== 'closed'
  return (
    <span className={css.root} data-git-branch="">
      <Menu
        open={open}
        items={menuItems(menu, switching, t)}
        selectedId={value.branch ?? undefined}
        onSelect={choose}
        onClose={closeMenu}
        side="bottom"
        align="start"
        portal
        anchor={(
          <Tooltip label={copy.tip} side="bottom" portal>
            <button
              type="button"
              className={clsx(css.chip, open && css.chipOpen)}
              aria-label={copy.aria}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggleMenu}
              data-git-branch-chip=""
            >
              <IconBranchOutlineRegular size={14} className={css.icon} />
              <span className={css.name}>{copy.label}</span>
              <IconChevronDownOutlineRegular size={12} className={clsx(css.chevron, open && css.chevronOpen)} />
            </button>
          </Tooltip>
        )}
      />
    </span>
  )
}

/** The read repository position, or null while hidden, loading, or outside a checkout. */
function positionValue(position: PositionState): RepositoryPosition | null {
  return position.phase === 'ready' ? position.value : null
}
