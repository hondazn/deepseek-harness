/** The session-header Git branch chip reads the checkout and switches branches. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { launchWebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const execute = promisify(execFile)

/** Run Git in a fixture directory with the developer's configuration isolated. */
async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execute('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '', GIT_CONFIG_PARAMETERS: '', GIT_CONFIG_COUNT: '0',
      GIT_AUTHOR_NAME: 'Git fixture', GIT_AUTHOR_EMAIL: 'git@example.invalid',
      GIT_COMMITTER_NAME: 'Git fixture', GIT_COMMITTER_EMAIL: 'git@example.invalid',
    },
  })
  return result.stdout.trim()
}

it('shows the checked-out branch beside the session title and switches it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-branch-browser-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const server = await startMockLlmServer({ sequence: ['success'], successText: 'BRANCH_CHIP_DONE' })
  onTestFinished(() => server.close())
  const key = credentialRef('DSH_GIT_BRANCH_BROWSER_KEY')
  const overlay = join(root, 'git-branch.yml')
  await writeFile(overlay, JSON.stringify([
    { id: 'llm-deepseek', config: { baseURL: server.baseURL, apiKeyEnv: key } },
    { id: 'agent-default-model', config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
  ]))
  const scaffold = await launchWebScaffold({ deepSeekMissingCredential: true, extraOverlayPath: overlay })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.credentials.set(key, 'git-branch-test-key')

  const repository = join(scaffold.workspaceCwd, 'repo')
  await git(scaffold.workspaceCwd, ['init', '-b', 'main', 'repo'])
  await writeFile(join(repository, 'tracked.txt'), 'initial\n')
  await git(repository, ['add', 'tracked.txt'])
  await git(repository, ['commit', '-m', 'initial'])
  await git(repository, ['branch', 'feature'])

  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.goto(scaffold.authenticatedUrl)
  await connectFreshWorkspace(page, scaffold.workspaceCwd, 'repo')

  const settled = scaffold.whenTurnSettled()
  const input = page.locator('[data-composer-input]').first()
  await input.fill('hello')
  await input.press('Enter')
  await settled

  const chip = page.locator('[data-git-branch-chip]')
  await chip.waitFor({ state: 'visible', timeout: 15_000 })
  await expect.poll(async () => await chip.textContent()).toContain('main')
  expect(await chip.getAttribute('aria-label')).toBe('Git branch: main')

  await chip.click()
  await page.getByRole('menuitem', { name: 'feature' }).click()
  await expect.poll(async () => await chip.textContent(), { timeout: 15_000 }).toContain('feature')
  expect(await git(repository, ['symbolic-ref', '--short', 'HEAD'])).toBe('feature')
}, 120_000)
