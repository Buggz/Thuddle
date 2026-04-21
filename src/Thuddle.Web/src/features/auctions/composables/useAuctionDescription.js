export function cleanBggDescription(raw) {
  if (!raw) return ''
  const cleaned = raw.replace(/&[^;]+;/g, ' ').replace(/<[^>]*>/g, '').trim()
  return cleaned.length > 1000 ? cleaned.slice(0, 1000) : cleaned
}

export function sortGamesByBggRank(games) {
  return [...(games ?? [])].sort((a, b) => {
    if (!a.bggRank && !b.bggRank) return 0
    if (!a.bggRank) return 1
    if (!b.bggRank) return -1
    return a.bggRank - b.bggRank
  })
}

export function buildAutoDescription(games) {
  if (!games || games.length === 0) return ''
  const sorted = sortGamesByBggRank(games)
  const cleaned = sorted.map(g => ({
    name: g.name,
    desc: cleanBggDescription(g.description || '')
  }))
  if (cleaned.length === 1) return cleaned[0].desc
  const header = `Package with ${cleaned.length} games:\n` + cleaned.map(g => g.name).join('\n')
  const body = cleaned.filter(g => g.desc).map(g => `${g.name}\n\n${g.desc}`).join('\n\n')
  return body ? `${header}\n\n${body}` : header
}
