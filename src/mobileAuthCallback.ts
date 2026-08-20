/**
 * The two things the official domain publishes so the iOS app's system sign-in can return
 * safely: the Apple App Site Association that turns `https://hsclubs.net/mobile-auth/callback`
 * into a Universal Link, and the fallback page a browser sees when the app is not installed.
 *
 * The domain is this guiding page (hsclubs.net -- the apex, which the directory moved onto when
 * the school site took mvhs.hsclubs.net), which is why these live here rather than on a school
 * site. See hsclubs-app#2. The callback carries a one-time authorization code as a query
 * parameter; the whole security argument for the fallback is that it does nothing with it -- it
 * never reads, displays, forwards or stores the query, so a code that lands in a browser instead
 * of the app simply expires unused.
 */
export const MOBILE_AUTH_CALLBACK_PATH = '/mobile-auth/callback'
export const AASA_PATH = '/.well-known/apple-app-site-association'

/**
 * Builds the AASA for a single app id, or null when none is configured.
 *
 * Null is deliberate: an AASA that names the wrong app id, or a placeholder one, would let the
 * wrong build claim the callback, so a deployment that has not been given the production
 * `TEAMID.bundleid` publishes no association at all rather than a guessed one.
 */
export const buildAppleAppSiteAssociation = (appId: string | null): unknown | null => {
  if (!appId || !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId)) return null
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [appId],
          // Only the callback path opens the app. Everything else on this domain stays a normal
          // web page, so the directory itself is never intercepted by the app.
          components: [
            {
              '/': MOBILE_AUTH_CALLBACK_PATH,
              comment: 'Mobile auth return channel; every other path stays in the browser.',
            },
          ],
        },
      ],
    },
  }
}

/**
 * The fallback page.
 *
 * Static: it takes no input and reflects none, so there is nothing on it that depends on the
 * query string it was loaded with. That is the point -- a page that echoed `code` or `state`
 * would leak exactly what the Universal Link exists to keep out of the browser.
 */
export const renderMobileAuthFallback = (): string =>
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Return to the HS Clubs app</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1f2933; }
      main { max-width: 30rem; margin: 12vh auto; padding: 2rem; background: #fff; border-radius: 16px; }
      h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
      p { margin: 0 0 0.75rem; }
      a { color: #2563eb; }
    </style>
  </head>
  <body>
    <main>
      <h1>Open this in the HS Clubs app</h1>
      <p>
        This page is the return step of signing in from the HS Clubs app. If you are seeing it in
        a browser, the app did not receive the sign-in. Open the HS Clubs app and try again.
      </p>
      <p>Nothing here is a working sign-in, so this page is safe to close.</p>
      <p><a href="/">Back to HS Clubs</a></p>
    </main>
  </body>
</html>
`
