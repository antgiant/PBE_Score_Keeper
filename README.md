🌐 [English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Secret Code](README.pig.md)

# PBE Score Keeper
A tool to help keep track of Pathfinder Bible Experience (PBE) (aka Bible Bowl) Scores by block and team.

## Install as an App (PWA)
PBE Score Keeper is optimized for mobile use and can be installed to your home screen.

1. Android (Chrome): Open the app, tap the browser menu, then tap "Install app" or "Add to Home screen".
2. iPhone/iPad (Safari): Open the app, tap Share, then tap "Add to Home Screen".
3. Desktop (Chrome/Edge): Open the app and use the install icon in the address bar, or browser menu > "Install".

After installation, open the app from your home screen/app launcher for the best full-screen experience.

## App File and Link Handling
When installed in a compatible Chromium-based browser, PBE Score Keeper can open `.yjs` and `.json` quiz export files directly from the operating system file picker or file manager.

The installed app also registers `web+pbe://` links, which are the browser-safe form of PBE deep links:
- `web+pbe://join/ABC123` opens the sync dialog with room `ABC123` filled in.
- `web+pbe://join/ABC123?password=PASS` also fills in the room password.
- `web+pbe://session/new` starts a new quiz session when the current quiz has enough data to allow session creation.
- `web+pbe://import?file=<encoded .yjs export URL>` imports a quiz export from a link.

Browser support for file and protocol handlers varies. If a handler is unavailable, use the in-app Import/Export tools.

## Data Storage Note
Data is stored only on your device, and is not shared in any way with any server. This means this data is only on your current device, and that you must use the Export Data options under Import/Export if you need to save copies of this data.

## Real-Time Sync Note
The Real-Time Sync feature allows multiple devices to collaborate on the same session using peer to peer communication. While the sync system includes multiple safeguards against data loss, there is an extremely rare scenario that could result in unexpected data merging:

**Conditions required (all must occur simultaneously):**
1. The sync server is temporarily unavailable
2. Two users create rooms at the exact same time
3. Both randomly generate the same 6-character room code (1 in 1,073,741,824 chance)
4. Both users enter the same password

If all four conditions align, the two separate sessions would merge their data together. This scenario is astronomically unlikely in practice but is documented here for completeness. Using the sync feature without a password (the default) prevents this issue entirely when the server is available.

## Contributing a Translation

Want to help translate PBE Score Keeper into your language? We'd love your help!

**To contribute a translation:**
1. Copy `scripts/i18n/en.js` as your starting point
2. Translate all the strings to your language
3. Submit a [Pull Request](https://github.com/antgiant/PBE_Score_Keeper/pulls) with your translation

**Not sure how to create a Pull Request?** No problem! You can:
- [Open an Issue](https://github.com/antgiant/PBE_Score_Keeper/issues/new?title=New%20Translation:%20[Language%20Name]&body=I%20would%20like%20to%20contribute%20a%20translation%20for%20[language].%0A%0A) to let us know you'd like to help
- Attach your translated file to the issue and we'll add it for you

See [AGENTS.md](AGENTS.md#adding-a-new-language) for detailed instructions on the translation format.

## Technical Details
[Technical Details](TECH.md)
