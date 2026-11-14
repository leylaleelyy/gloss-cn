<a href="https://usegloss.io">
  <img alt="Gloss" src="./public/og.png">
  <h1 align="center">Gloss</h1>
</a>

<p align="center">
  An open source AI reader for articles and PDFs. Select any line, ask a question, and get a cited answer in the margin. Uses your chosen OpenAI-compatible AI provider.
</p>

## Tech stack

- A configurable OpenAI-compatible API for chat, summaries, and vision OCR
- [Exa](https://exa.ai) for web search
- [LiteParse](https://github.com/run-llama/liteparse) for in-browser PDF parsing, with your configured vision model for scanned pages
- [Clerk](https://clerk.com) for optional auth and [Neon](https://neon.tech) for syncing your library
- Next.js app router with Tailwind

## Cloning & running

1. Clone the repo: `git clone https://github.com/Nutlope/gloss`
2. Create a `.env.local` file (use `.env.example` for reference) and add your API keys:
   - Optional AI defaults: `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` (or use **AI settings** in the app).
   - **Database URL** from [Neon](https://neon.tech): `DATABASE_URL=`
   - **Clerk keys** from [Clerk](https://clerk.com): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=` and `CLERK_SECRET_KEY=`
   - **Exa API key** (optional, for web search): `EXA_API_KEY=`
3. Run `npm install`. Run `npm run db:migrate` only if you configured cloud sync.
4. Run `npm run dev` and open http://localhost:3100

## Future Tasks

- [ ] Ship it as a browser extension that opens the same margin on any page
- [ ] Let a gloss compare two passages you pick at once
- [ ] Move the shared-key rate limit to a store like Upstash so it holds across instances

## Omarchy desktop app

The NSH/WebView desktop edition builds and runs locally on Linux. See
[desktop/README.md](desktop/README.md) for installation, packaging, and limitations.

PDF imports have no application page-count limit and do not need an API key for text extraction. Scanned pages and careful re-reading use your chosen vision model. Hardware memory, storage, and provider context limits still apply.

EPUB 2/3 books can be opened from **Add articles → Open files**, dropped on the home screen, or imported from an EPUB link. Chapters follow the book’s reading order; text formatting, metadata, and embedded raster images are retained. Book scripts and remote images are not loaded. DRM-protected chapters are unsupported.

### Reading and vocabulary learning

Select a word or phrase and choose **Define** for a contextual dictionary card with English and your selected response language. **Save word / 保存生词** stores its original sentence and book location locally. Select a longer passage and choose **Analyze** for simplified English, translation, grammar structure, and useful vocabulary.

Open **词 / 生词本** in the top bar to search saved words, change mastery (new, familiar, mastered), and return to their source paragraphs. Vocabulary is stored in the browser profile's `gloss-learning` IndexedDB database, independent of the existing library. It stays on this device and is not cloud-synced. Removing a book does not remove its saved words; source links require the book to remain in the library.

**Appearance → Answers → Learning** controls CEFR A1–C2, bilingual/English/response-language definitions, and saved-word highlighting. Chinese remains the default response language. US/UK pronunciation in dictionary cards and the vocabulary notebook uses a private offline eSpeak NG runtime on the desktop. Install it on Arch/Omarchy with `npm run desktop:speech` (signed repository packages, no sudo), or install system `espeak-ng`. Synthetic US and UK voices are distinct; no API key or network is needed for playback. Click again to stop; starting another clip stops the previous one. Speech is generated on demand and cached in memory. The runtime lives in `~/.local/share/gloss-desktop/speech` and survives desktop rebuilds. Validate it with `npm run test:pronunciation`.

Saved words are highlighted with the CSS Custom Highlight API in supported browsers (including the Chromium desktop). Only nearby paragraphs are scanned, in frame-bounded batches; the reader's text DOM and annotation offsets stay unchanged. Mastered words are excluded. Browsers without this API still support the notebook and learning cards.

Validation: `npm run test:learning`, `npm run test:ai-provider` (after a desktop web build), and `npm run lint`.

Analyze now creates a saved violet margin card using the same card layout as Explain. Both actions can annotate the same word or sentence independently. Use **Explain this selection** / **Analyze this selection** on a card to switch to its counterpart, or create it if missing. Clicking a text mark shared by both cycles between their cards. Analysis retains its simplification, translation, structure, vocabulary saving and US/UK pronunciation; it also supports follow-ups, retry, copy and deletion. The dictionary remains a compact dialog.

Desktop scrollbars follow the current paper/ink theme with rounded thumbs and stable gutters. Vocabulary navigation uses an English label and book icon, including an active-page state on the notebook.

## Cloudflare Workers

This repository supports a separate Web build using OpenNext; the Omarchy
desktop build and its local library remain separate.

1. Run `npm ci` and `npx wrangler login`.
2. Run `npm run cf:build` to build the Worker, then `npm run cf:preview`
   to test it locally.
3. Run `npm run cf:deploy` to publish the configured `gloss-cn` Worker.

Readers can configure an OpenAI-compatible provider in **AI settings**.
Do not put private provider keys into Git or `NEXT_PUBLIC_*` variables.
Optional shared server defaults belong in Cloudflare secrets; enabling them
makes that provider available to visitors. Clerk and Neon are optional.

The Web pronunciation controls use installed browser/system US and UK English
voices. Desktop pronunciation uses the bundled eSpeak runtime and PipeWire.
The Web build never executes desktop audio commands.

Keep `.open-next/`, `.wrangler/`, `.dev.vars*`, and local `.env*` files out of Git.

### Word Wise reading hints

Use the reader toolbar's Word Wise toggle to show short English hints above unfamiliar
words, and choose your English level (A1–C2) beside it. Tap a marked word to open its
dictionary card. Notebook definitions take priority and mastered words are excluded.
New AI hints use your configured provider; cached and notebook hints remain available
when the provider is unavailable. Async hints preserve paragraph positions and share
a background worker with vocabulary highlighting.

Validation: `npm run test:word-wise` and `npm run test:learning`. With a local server
running, set `GLOSS_TEST_URL` and run `npm run test:word-wise-reader` and
`npm run test:ipad` for isolated Chromium touch-layout checks with mocked AI replies.

### Reader improvements recovered into main

- Collapsed dictionary cards retain definitions in the selected language; Explain and
  Analyze cards retain their key summary even in crowded margins. Expanded margin
  cards use one scroll area with a sticky header.
- Searchable chapter navigation uses EPUB navigation titles or document headings.
  Long-distance jumps settle immediately, and the left navigation can be collapsed.
- Typeface, size, spacing, width, alignment and paragraph style are saved per book,
  including restoration before the first paint.
- Touch selection survives native handle handoff; popovers restore focus on Escape
  while retaining the iPad viewport positioning and keyboard fixes.
- Reading progress and annotations flush on backgrounding or exit. Long books use
  cached paragraph lookup, sampled navigation bars and batched resize work.
- Figures support contextual image explanations and follow-up cards through the
  configured vision provider. EPUB/text parsing runs in a worker; PDF batches yield
  to keep the interface responsive. Unsorted books retry automatic classification
  when connectivity or provider settings change.

The archived Kindle work was audited file by file. Kindle display detection, e-ink
styles and controls, the Kindle route, legacy CSS dependencies/build scripts,
Kindle deployment configuration and device-specific tests are intentionally excluded.
The archived mobile fixed-position popover CSS was superseded by the iPad viewport
positioning fix; reading width remains independent of font size.

Additional regression checks: `npm run test:reader-reliability`, `npm run test:epub`,
`npm run test:ai-provider`, and the full `npm run test:word-wise-reader` browser suite.
