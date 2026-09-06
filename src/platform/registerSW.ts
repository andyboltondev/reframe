/**
 * Service worker registration for the web build.
 *
 * The app is offline-capable: the whole bundle, including the WebAssembly
 * codecs, is precached, so a conversion works with no network at all.
 *
 * Updates are silent and automatic. A new deployment is downloaded in the
 * background and takes over the next time the app is opened, rather than
 * being forced onto the running page — reloading mid-batch would throw away
 * work in progress. Nothing is ever asked of the user.
 *
 * The desktop shell serves its own files and ships updates through its
 * installer, so registration is skipped there.
 */

const UPDATE_INTERVAL = 60 * 60 * 1000

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function registerServiceWorker(): Promise<void> {
  // No service worker is generated for the dev server, so registering there
  // would only produce a console error.
  if (!import.meta.env.PROD) return
  if (isTauri() || !('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL, type: 'classic' },
    )

    // A tab left open for days would otherwise never look for a new build.
    setInterval(() => { void registration.update() }, UPDATE_INTERVAL)
  } catch {
    // An unavailable service worker only costs offline support; the app itself
    // still runs, so there is nothing worth reporting to the user.
  }
}
