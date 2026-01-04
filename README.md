# PBE Score Keeper
A tool to help keep track of Pathfinder Bible Experience (PBE) (aka Bible Bowl) Scores by block/group and team.

## Data Storage Note
Data is stored only on your device, and is not shared in any way with any server. This means this data is only on your current device, and that you must use the Export Data options under Advanced if you need to save copies of this data.

## JavaScript Structure
The app is split into focused scripts loaded in `index.html`:

- `scripts/app-globals.js`: shared globals and HTML escaping.
- `scripts/app-theme.js`: theme preference and system theme handling.
- `scripts/app-state.js`: state initialization, upgrades, and storage helpers.
- `scripts/app-data.js`: event handlers and data mutation logic.
- `scripts/app-summaries.js`: score summary and log builders.
- `scripts/app-import-export.js`: CSV/JSON export and import handling.
- `scripts/app-display.js`: UI wiring and display sync.
- `scripts/app.js`: bootstrap (runs initialization).

## Tests
Run the unit tests with:

```sh
node --test
```

Watch mode:

```sh
node --test --watch
```

Readable summary table:

```sh
node --test --test-reporter ./tests/helpers/table-reporter.js
```

Readable summary table in watch mode:

```sh
node --test --watch --test-reporter ./tests/helpers/table-reporter.js
```

### Test Structure
- `tests/unit/` for pure logic tests.
- `tests/ui/` for UI/DOM interaction tests.
- `tests/helpers/` for shared test utilities.
