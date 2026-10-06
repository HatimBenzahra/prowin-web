/** Télécharge un markdown du référentiel, pour le corriger puis le réimporter. */
export function downloadMarkdown(fileName, markdown) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  // Attaché au document le temps du clic : certains navigateurs l'exigent.
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
