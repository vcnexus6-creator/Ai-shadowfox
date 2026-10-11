# Ai-shadowfox

A model that is helpful in reducing machine cost.

**AI Plant Operations Optimiser** spots machines drifting toward failure and recommends the cheapest response that keeps customer orders on time. It runs as a phone app in two ways: an Android APK, or a web app you add to your home screen.

## Screenshots

| Home | Impact | Options | Plan | Learn |
| --- | --- | --- | --- | --- |
| ![Home](docs/screenshots/1-home.png) | ![Impact assessment](docs/screenshots/2-impact.png) | ![Response options](docs/screenshots/3-options.png) | ![Recommended plan](docs/screenshots/4-plan.png) | ![Outcome and learning](docs/screenshots/5-learn.png) |

On a laptop or desktop the same page switches to a website layout: navigation across the top, two-column content and centred dialogs.

| Website: Home | Website: Options |
| --- | --- |
| ![Home on a desktop](docs/screenshots/desktop-home.png) | ![Response options on a desktop](docs/screenshots/desktop-options.png) |

## Download

| What | Link |
| --- | --- |
| Android app (APK) | https://github.com/vcnexus6-creator/Ai-shadowfox/releases/download/apk-latest/plant-ops-optimiser.apk |
| Mobile app as one HTML file (phone browser) | https://github.com/vcnexus6-creator/Ai-shadowfox/releases/download/apk-latest/plant-ops-optimiser.html |
| Website as one HTML file (laptop or desktop browser) | https://github.com/vcnexus6-creator/Ai-shadowfox/releases/download/apk-latest/plant-ops-website.html |

Both are rebuilt on every merge to `main`. While the repository is private, these links ask for a GitHub sign-in with access to the repo; once it is public, anyone with the link can download.

To build the HTML files yourself: `python3 tools/build_single_html.py` (writes `dist/plant-ops-optimiser.html` and `dist/plant-ops-website.html`).

## Install on a phone

### Android (APK)
1. Open the repo's **Actions** tab, then **Android APK**, then the latest green run.
2. Download **plant-ops-optimiser-apk** (a zip), unzip it on the phone and tap `plant-ops-optimiser.apk`.
3. Allow "install unknown apps" for your browser or file manager when Android asks.

After a merge to `main`, the APK is also published under **Releases → apk-latest**, so the phone can download it directly.

### Android or iPhone (web app)
1. One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. After a merge to `main`, the **Web app** workflow publishes the app to GitHub Pages.
3. Open that link on the phone. On Android, tap **Install app**; on iPhone, tap **Share → Add to Home Screen**.

The web app works offline once it has been opened.

## Project layout

| Path | What it is |
| --- | --- |
| `app/www/index.html` | The phone app: Home, Impact, Options, Plan, Learn, More |
| `app/www/classic.html` | Full analysis view, with Plant Saathi and Live machine (opened from More) |
| `app/www/engine.js` | Simulated plant data and the decision engine used by the phone app |
| `app/www/` (other) | Manifest, service worker, icons |
| `app/android/` | Capacitor Android project that wraps `app/www` |
| `app/assets/` | Source images for the Android icon and splash screen |
| `.github/workflows/` | Builds the APK and publishes the web app |

## Work on it locally

```bash
cd app
npm install
npm run serve            # preview at http://localhost:8080
npm run android:sync     # copy www/ into the Android project after editing
npm run android:open     # open in Android Studio to run on a phone or emulator
npm run android:icons    # regenerate icons/splash from app/assets/
```

## Notes

- All plant, machine, order and cost data is simulated.
- Plant Saathi's AI answers need the page to be opened inside Claude. In the APK or web app, Plant Saathi switches itself off and shows a note; everything else works.
