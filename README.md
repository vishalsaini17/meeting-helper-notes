# Meeting Note Helper

A local-first Windows desktop Markdown editor for writing meeting notes with a WYSIWYG interface.

## Requirements

- Node.js 22.12 or later
- npm
- Windows 10 or Windows 11 for target-platform verification

## Run Locally

```sh
npm install
npm run dev
```

The application uses native open/save dialogs and stores ordinary UTF-8 `.md` files on the local device.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

## Windows Distribution

On Windows, run `npm run package:win` to create an NSIS installer and a portable standalone `.exe` in `release/`. The installer supports choosing an installation directory and creates Start Menu and desktop shortcuts. Installed applications can be removed with the generated Windows uninstaller. Neither package requires Node.js or development tools on the target machine. On Linux, run `npm run package:win:portable` to build the portable executable; producing the NSIS installer from Linux requires Wine.

Windows artifacts can also be cross-packaged from Linux when electron-builder's target tooling is available, but installation, shortcut, launch, privacy, and uninstall behavior must still be verified on Windows 10 and Windows 11. See [docs/TESTING.md](docs/TESTING.md).

See [docs/TESTING.md](docs/TESTING.md) for packaged Windows verification and [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md) for the staged implementation prompt sequence.