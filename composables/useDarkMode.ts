/**
 * Automatic dark mode — no manual toggle. Prefers the OS `prefers-color-scheme`
 * setting; on browsers that don't support the media feature at all, falls back
 * to a fixed 7pm–6am local-time window.
 */
export function useDarkMode() {
  const isDark = ref(false)

  function timeBasedDark(): boolean {
    const hour = new Date().getHours()
    return hour >= 19 || hour < 6
  }

  let mql: MediaQueryList | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function update() {
    if (mql) {
      isDark.value = mql.matches
    } else {
      isDark.value = timeBasedDark()
    }
  }

  onMounted(() => {
    if (window.matchMedia) {
      // Unsupported browsers report the bare feature query as `not all`.
      const supportsColorScheme = window.matchMedia('(prefers-color-scheme)').media !== 'not all'
      if (supportsColorScheme) {
        mql = window.matchMedia('(prefers-color-scheme: dark)')
        mql.addEventListener('change', update)
      }
    }
    update()
    // Re-check every minute so the time-based fallback crosses the 7pm/6am boundary live.
    timer = setInterval(update, 60_000)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    if (mql) mql.removeEventListener('change', update)
  })

  return { isDark }
}
