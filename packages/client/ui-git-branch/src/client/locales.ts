/** `gitBranch` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'gitBranch'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'chip.aria': 'Git 分支：{branch}',
  'chip.detached': '分离头指针',
  'chip.detachedAria': '分离头指针：{commit}',
  'chip.detachedTooltip': '分离头指针位于 {commit}；点击切换分支',
  'chip.tooltip': '切换分支（当前：{branch}）',
  'menu.title': '切换分支',
  'menu.loading': '正在读取分支…',
  'menu.empty': '没有本地分支',
  'menu.busy': '正在切换分支…',
  'error.unknownBranch': '没有名为 {branch} 的本地分支',
  'error.dirty': '有未提交的修改，切换分支会覆盖它们',
  'error.failed': 'Git 拒绝了切换：{message}',
  'error.branches': '无法读取本地分支',
} as const

/** Key domain of the `gitBranch` namespace (zh is the source of truth). */
export type GitBranchKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header Git branch copy. */
    gitBranch: GitBranchKey
  }
}

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<GitBranchKey, string> = {
  'chip.aria': 'Git branch: {branch}',
  'chip.detached': 'Detached HEAD',
  'chip.detachedAria': 'Detached HEAD at {commit}',
  'chip.detachedTooltip': 'Detached HEAD at {commit}. Click to switch branch.',
  'chip.tooltip': 'Switch branch (current: {branch})',
  'menu.title': 'Switch branch',
  'menu.loading': 'Reading branches…',
  'menu.empty': 'No local branches',
  'menu.busy': 'Switching branch…',
  'error.unknownBranch': 'No local branch named {branch}',
  'error.dirty': 'Uncommitted changes would be overwritten',
  'error.failed': 'Git refused the switch: {message}',
  'error.branches': 'Could not read the local branches',
}

/** Japanese copy, checked against the English keys. */
export const ja: Record<GitBranchKey, string> = {
  'chip.aria': 'Git ブランチ：{branch}',
  'chip.detached': '切り離された HEAD',
  'chip.detachedAria': '切り離された HEAD：{commit}',
  'chip.detachedTooltip': 'HEAD は {commit} で切り離されています。クリックでブランチを切り替えます。',
  'chip.tooltip': 'ブランチを切り替える（現在：{branch}）',
  'menu.title': 'ブランチを切り替える',
  'menu.loading': 'ブランチを読み込み中…',
  'menu.empty': 'ローカルブランチがありません',
  'menu.busy': 'ブランチを切り替え中…',
  'error.unknownBranch': '{branch} というローカルブランチはありません',
  'error.dirty': '未コミットの変更が上書きされます',
  'error.failed': 'Git が切り替えを拒否しました：{message}',
  'error.branches': 'ローカルブランチを読み込めませんでした',
}

/** Spanish copy, checked against the English keys. */
export const es: Record<GitBranchKey, string> = {
  'chip.aria': 'Rama de Git: {branch}',
  'chip.detached': 'HEAD separado',
  'chip.detachedAria': 'HEAD separado en {commit}',
  'chip.detachedTooltip': 'HEAD separado en {commit}. Haz clic para cambiar de rama.',
  'chip.tooltip': 'Cambiar de rama (actual: {branch})',
  'menu.title': 'Cambiar de rama',
  'menu.loading': 'Leyendo ramas…',
  'menu.empty': 'No hay ramas locales',
  'menu.busy': 'Cambiando de rama…',
  'error.unknownBranch': 'No existe la rama local {branch}',
  'error.dirty': 'Los cambios sin confirmar se sobrescribirían',
  'error.failed': 'Git rechazó el cambio: {message}',
  'error.branches': 'No se pudieron leer las ramas locales',
}

/** French copy, checked against the English keys. */
export const fr: Record<GitBranchKey, string> = {
  'chip.aria': 'Branche Git : {branch}',
  'chip.detached': 'HEAD détachée',
  'chip.detachedAria': 'HEAD détachée sur {commit}',
  'chip.detachedTooltip': 'HEAD détachée sur {commit}. Cliquez pour changer de branche.',
  'chip.tooltip': 'Changer de branche (actuelle : {branch})',
  'menu.title': 'Changer de branche',
  'menu.loading': 'Lecture des branches…',
  'menu.empty': 'Aucune branche locale',
  'menu.busy': 'Changement de branche…',
  'error.unknownBranch': 'Aucune branche locale nommée {branch}',
  'error.dirty': 'Des modifications non validées seraient écrasées',
  'error.failed': 'Git a refusé le changement : {message}',
  'error.branches': 'Impossible de lire les branches locales',
}

/** German copy, checked against the English keys. */
export const de: Record<GitBranchKey, string> = {
  'chip.aria': 'Git-Branch: {branch}',
  'chip.detached': 'Losgelöster HEAD',
  'chip.detachedAria': 'Losgelöster HEAD bei {commit}',
  'chip.detachedTooltip': 'Losgelöster HEAD bei {commit}. Klicken, um den Branch zu wechseln.',
  'chip.tooltip': 'Branch wechseln (aktuell: {branch})',
  'menu.title': 'Branch wechseln',
  'menu.loading': 'Branches werden gelesen…',
  'menu.empty': 'Keine lokalen Branches',
  'menu.busy': 'Branch wird gewechselt…',
  'error.unknownBranch': 'Kein lokaler Branch namens {branch}',
  'error.dirty': 'Nicht übernommene Änderungen würden überschrieben',
  'error.failed': 'Git hat den Wechsel abgelehnt: {message}',
  'error.branches': 'Lokale Branches konnten nicht gelesen werden',
}

/** Russian copy, checked against the English keys. */
export const ru: Record<GitBranchKey, string> = {
  'chip.aria': 'Ветка Git: {branch}',
  'chip.detached': 'Отделённый HEAD',
  'chip.detachedAria': 'Отделённый HEAD на {commit}',
  'chip.detachedTooltip': 'Отделённый HEAD на {commit}. Нажмите, чтобы переключить ветку.',
  'chip.tooltip': 'Переключить ветку (текущая: {branch})',
  'menu.title': 'Переключить ветку',
  'menu.loading': 'Чтение веток…',
  'menu.empty': 'Локальных веток нет',
  'menu.busy': 'Переключение ветки…',
  'error.unknownBranch': 'Нет локальной ветки {branch}',
  'error.dirty': 'Незакоммиченные изменения будут перезаписаны',
  'error.failed': 'Git отклонил переключение: {message}',
  'error.branches': 'Не удалось прочитать локальные ветки',
}

/** Portuguese copy, checked against the English keys. */
export const pt: Record<GitBranchKey, string> = {
  'chip.aria': 'Branch do Git: {branch}',
  'chip.detached': 'HEAD destacado',
  'chip.detachedAria': 'HEAD destacado em {commit}',
  'chip.detachedTooltip': 'HEAD destacado em {commit}. Clique para trocar de branch.',
  'chip.tooltip': 'Trocar de branch (atual: {branch})',
  'menu.title': 'Trocar de branch',
  'menu.loading': 'Lendo branches…',
  'menu.empty': 'Nenhum branch local',
  'menu.busy': 'Trocando de branch…',
  'error.unknownBranch': 'Nenhum branch local chamado {branch}',
  'error.dirty': 'Alterações não confirmadas seriam sobrescritas',
  'error.failed': 'O Git recusou a troca: {message}',
  'error.branches': 'Não foi possível ler os branches locais',
}
