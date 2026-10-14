/** The themes this mod ships in themes/<slug>.json, in rotation order. */
export const THEMES = [
  { slug: 'catppuccin-mocha', name: 'Catppuccin Mocha' },
  { slug: 'tokyo-night', name: 'Tokyo Night' },
  { slug: 'gruvbox-dark', name: 'Gruvbox Dark' },
  { slug: 'nord', name: 'Nord' },
  { slug: 'dracula', name: 'Dracula' },
  { slug: 'rose-pine', name: 'Rosé Pine' },
  { slug: 'everforest', name: 'Everforest' },
  { slug: 'kanagawa', name: 'Kanagawa' },
  { slug: 'one-dark', name: 'One Dark' },
  { slug: 'catppuccin-macchiato', name: 'Catppuccin Macchiato' },
  { slug: 'solarized-dark', name: 'Solarized Dark' },
  { slug: 'catppuccin-frappe', name: 'Catppuccin Frappé' },
  { slug: 'synthwave', name: "Synthwave '84" },
  { slug: 'catppuccin-latte', name: 'Catppuccin Latte', isLight: true },
] as const

export type Slug = (typeof THEMES)[number]['slug']

/** Light themes sit out the rotation: on a dark terminal their text would be dark on dark. */
export const ROTATION: readonly Slug[] = THEMES.filter(theme => !('isLight' in theme)).map(theme => theme.slug)

export const SETTING_PREFIX = 'custom:themes:'

export function settingFor(slug: string): string {
  return `${SETTING_PREFIX}${slug}`
}

export function nameOf(slug: string): string {
  return THEMES.find(theme => theme.slug === slug)?.name ?? slug
}

/** A theme by slug, or by a loose spelling of its name ("mocha", "Tokyo Night", "rosepine"). */
export function findTheme(asked: string): Slug | undefined {
  const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
  const wanted = plain(asked)
  if (wanted === '') return undefined
  const exact = THEMES.find(theme => plain(theme.slug) === wanted || plain(theme.name) === wanted)
  if (exact) return exact.slug
  const partial = THEMES.filter(theme => plain(theme.slug).includes(wanted))
  return partial.length === 1 ? partial[0]!.slug : undefined
}
