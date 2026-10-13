/**
 * Both built-in stacks render kanji with Japanese glyph forms.
 *
 * `-apple-system` and 'Segoe UI' carry no CJK, so the first listed family that
 * has the character decides the glyph forms: a Simplified-Chinese family ahead
 * of the Japanese ones renders kanji with Chinese forms. The Chinese families
 * stay listed behind them as the fallback for characters outside the Japanese
 * repertoires.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { packageStylesheets, parseRules } from './stylesheet-scan.ts'
import type { CssRule } from './stylesheet-scan.ts'

/** Japanese families every stack must reach before any Chinese one. */
const JAPANESE_FAMILIES = [
  'Hiragino Sans',
  'Hiragino Kaku Gothic ProN',
  'Yu Gothic UI',
  'Yu Gothic',
  'Meiryo',
  'Noto Sans JP',
  'Noto Sans CJK JP',
]

/** Simplified-Chinese families retained as the fallback tail. */
const CHINESE_FAMILIES = ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei']

const BASE_SHEET = 'packages/client/ui-theme/src/styles/base.css'
const sheetPath = packageStylesheets().find(path => path.endsWith(BASE_SHEET))
if (sheetPath === undefined) throw new Error(`${BASE_SHEET} not found under packages/`)

const rootRule = parseRules(readFileSync(sheetPath, 'utf8')).find(rule => rule.selectors.includes(':root'))
if (rootRule === undefined) throw new Error(`${BASE_SHEET} declares no :root rule`)

/**
 * Family names of one built-in stack, in declaration order.
 * @param rule - the `:root` rule holding the built-in stacks.
 * @param property - custom property holding the stack.
 * @returns unquoted family names.
 */
function stackFamilies(rule: CssRule, property: string): string[] {
  const declaration = rule.declarations.find(([name]) => name === property)
  if (declaration === undefined) throw new Error(`${BASE_SHEET} declares no ${property}`)
  return declaration[1].split(',').map(family => family.trim().replace(/^['"]|['"]$/g, ''))
}

describe('built-in font stacks', () => {
  it.each(['--dsh-font-family-text-default', '--dsh-font-family-code-default'])(
    '%s reaches the Japanese families before the Chinese ones',
    (property) => {
      const families = stackFamilies(rootRule, property)
      const firstChinese = families.findIndex(family => CHINESE_FAMILIES.includes(family))
      expect(firstChinese, `${property} keeps no Chinese fallback`).toBeGreaterThan(-1)
      for (const japanese of JAPANESE_FAMILIES) {
        const index = families.indexOf(japanese)
        expect(index, `${property} omits ${japanese}`).toBeGreaterThan(-1)
        expect(index, `${property} lists ${japanese} after ${families[firstChinese]}`).toBeLessThan(firstChinese)
      }
    },
  )
})
