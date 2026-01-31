🌐 [English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Secret Code](README.pig.md)

# PBE Score Keeper
A tool to help keep track of Pathfinder Bible Experience (PBE) (aka Bible Bowl) Scores by block and team.

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