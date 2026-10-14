import data from '../mods.json'

export interface Mod {
  name: string
  category: string
  pitch: string
  description: string
  demoDescription: string
  version: string
  author: string
  authorUrl?: string
  tags: string[]
  video?: string
  poster?: string
  gif?: string
  source: string
  install: string[]
}

// mods.json is already ordered by category, then marketplace order.
export const mods = data as Mod[]
export const getMod = (name: string) => mods.find(m => m.name === name)
export const inCategory = (category: string) => mods.filter(m => m.category === category)
