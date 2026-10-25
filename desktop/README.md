# Gloss Desktop for Omarchy

Gloss now uses an installed Chromium browser in a dedicated app window. The
launcher starts a bundled Next.js server on `127.0.0.1:3101`, opens the window,
and stops the server when the window closes. Node.js is bundled; Chromium is
provided by the system (`/usr/bin/chromium`, or `CHROMIUM_BIN`). The NSH WebKit
runner is retained for migration and an optional fallback.

On first launch, the original NSH profile is backed up record by record, then
restored into `~/.local/share/gloss-desktop/chromium`. Settings, notes, reading
progress, documents, original PDFs, and painted covers are included. A private
backup remains in `~/.local/share/gloss-desktop/webkit-backup`, and the original
WebKit profile is left intact. Migration is marked complete only after importing
and verifying every record. Keep these directories when upgrading.

## Build

On Omarchy, install Chromium and the WebView runtime used for migration:

```sh
omarchy pkg add chromium webkitgtk-6.0
mise install github:longbridge/nsh@0.2.0
npm ci
npm run desktop:build
npm run desktop:install
npm run desktop:start
```

You can also launch **Gloss Desktop** from the application menu or run
`~/.local/bin/gloss-desktop`. The installed launcher points into this checkout's
`desktop/out/Gloss` folder, so keep it in place. Rebuild after changing source.

`npm run desktop:check` checks the NSH UI. `NSH_BIN=/path/to/nsh` can override
mise for the build script. The tested NSH version is 0.2.0.

## Package and runtime

- `desktop/out/Gloss/`: complete Linux x86_64 application directory.
- `desktop/out/Gloss.tar.gz`: archive containing the same directory. Extract it
  and run `Gloss/Gloss` on a compatible Linux system with GTK 4.14+, glibc 2.39+
  and WebKitGTK 6.0. The bundled Node binary may require newer system libraries;
  this build is intended for the Omarchy machine where it was built.
- `~/.local/state/gloss-desktop/app.log`: launcher, server and native runtime logs
  (honors `XDG_STATE_HOME`).
- Port 3101 must be free. A second instance refuses to start rather than connecting
  to an unknown server or changing the origin used for library storage.

The web build stays in `.next`; the desktop build uses `.next-desktop` and sets
`NEXT_PUBLIC_DESKTOP_LOCAL=1`. The desktop edition has local reading and library
storage with account/cloud sync controls disabled. The regular web edition still
uses Clerk when its publishable key is configured; without it, it also supports
anonymous local reading. Account-only API routes remain unauthorized locally.

Open **AI settings** and enter your OpenAI-compatible API base URL, exact chat model ID, and an optional API key. Private runtime defaults can supply a provider. Online imports,
AI and optional remote services still require network access. No `.env` files are
included in the desktop package. Browser data from your usual browser is separate
from the dedicated desktop profile. The first-run migration transfers the NSH data automatically.

Chromium provides the desktop window, selection, clipboard, and downloads.
`GLOSS_ENGINE=nsh gloss-desktop` opens the legacy WebKit version if needed; it
uses its original, separate profile. Changes made in Chromium do not sync back
to that fallback profile. No rendering workaround flags are applied to Chromium.

## Remove the menu entry

Remove `~/.local/bin/gloss-desktop` and
`~/.local/share/applications/io.usegloss.desktop.desktop` (or the corresponding
`XDG_DATA_HOME` path). Removing those launchers does not delete your library.

## AI provider and PDF pages

The base URL includes the API prefix, for example `http://localhost:11434/v1`
for a compatible local server. Set a model already installed or available there.
Blank API keys work with servers that do not require authentication. Settings
are stored on this device and are sent only with AI requests; a custom endpoint
never inherits a server-side API key. Test connection uses `/models`; you may
save even if your provider does not support that endpoint.

Vision defaults to the chat model; choose an image-capable model for scans and
careful re-reading. Optional speech model/voice and image model fields enable
read aloud and cover painting when your provider supports those endpoints.
These capabilities vary by provider. Token usage is shown; price estimates are
not fabricated for unknown models.

Text PDFs need no AI credentials. There is no fixed page-count cap, including
LiteParse's default 1,000-page cap. Rendering and OCR run in bounded batches.
Memory, disk capacity and the provider's context limits still apply. Careful
re-reading uses your vision provider for every page and only replaces the stored
text after all pages succeed.

EPUB 2/3 books can be opened from **Add articles → Open files**, dropped on the home screen, or imported from an EPUB link. Chapters follow the book’s reading order; text formatting, metadata, and embedded raster images are retained. Book scripts and remote images are not loaded. DRM-protected chapters are unsupported.

Private app-wide AI defaults can be stored in `~/.config/gloss-desktop/ai.env` (or `$XDG_CONFIG_HOME/gloss-desktop/ai.env`) using the `AI_*` variables in `.env.example`. This file is loaded on launch and is never included in the package. Device settings override these defaults. Restart the app after changing this file.

### Why Chromium is now the default

On this Intel HD 615 system with WebKitGTK 2.54.1, GPU painting flashed during
hover and book animations. Changing GTK's renderer did not solve it. Forced full
redraw reduced flashing; disabling Wayland offload and the DMA-BUF atlas did not
eliminate it. CPU painting removed the flashing but remained too slow. Chromium
avoids that WebKit painting path and uses the original web animations.

These observations isolate a WebKit accelerated-painting compatibility problem
on this system; they do not identify a specific upstream driver or WebKit bug.
The old NSH runner remains available for recovery, with its data untouched.
