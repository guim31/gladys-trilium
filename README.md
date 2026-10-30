# Trilium Notes for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Trilium Notes](https://triliumnotes.org) (TriliumNext), the self-hosted
hierarchical note-taking application: follow your counters and your open
to-dos, react when a note is created or changed, create notes from scenes and
keep a journal of the house in the day note of Trilium. Local only.

Tested against a real TriliumNext v0.106.1 (`triliumnext/trilium` Docker
image).

## Features

- **A Trilium device**: notes, notes changed today, open to-dos (a label,
  `todo` by default, without `#done`), and the title of the latest changed
  note.
- **Dashboard widget** "Trilium": three tiles and the notes changed last, or
  the open to-dos of a label, each opening in Trilium over https.
- **Scene triggers** "Trilium note created or updated" (filter: created or
  updated) and "Labeled Trilium note changed" (filter: a label), silent at
  installation, remembered across restarts.
- **Scene actions**: "Add a line to the Trilium day note" (a timed journal in
  the calendar of Trilium) and "Create a Trilium note" (under a chosen note,
  with content and labels).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- A Trilium server (TriliumNext; tested with 0.106.1) reachable from Gladys, and an ETAPI token (Options → ETAPI → Create new ETAPI token).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-trilium` (or find **Trilium Notes** in the
   catalog).
2. In **Configuration**, enter the address of Trilium (`192.168.1.50:8080`) and
   the ETAPI token. Save.
3. Add the **Trilium** device from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Trilium pushes nothing: the container reads it every 15 minutes by default (5
to 60), and just after midnight, through the ETAPI (`Authorization: <token>`):
`/app-info` and the root note once, then a few searches — every note, the notes
changed since midnight (`note.utcDateModified >= '…'`) and the open to-dos
(`#todo #!done`) counted as a stream (ETAPI has no count, and a full answer of a
large base would not fit in 256 MB), the twenty notes changed last, and the
notes changed since the last read, with their labels. The triggers keep the
time of the newest change seen in `/data`. The device is published with
`should_poll: false`; only changed states are sent to Gladys. The device id is
the creation time of the root note: it survives a change of address.

## Limitations

- The triggers fire at the next read, not instantly; at most ten notes per read
  (the next ones at the next read; past 50 changes at once, the rest is
  skipped). Deleted and moved notes, and labels added alone, are not announced.
- Protected notes are counted, but never read nor written. Archived notes are
  left out.
- Nothing is ever deleted or moved in Trilium.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Trilium answering with
bodies recorded on a real TriliumNext v0.106.1 (`test/fixtures/trilium/`).

## Credits

- [TriliumNext Notes](https://github.com/TriliumNext/Trilium), by the
  TriliumNext contributors, and the original
  [Trilium Notes](https://github.com/zadam/trilium) by zadam (AGPL-3.0): this
  integration only talks to the ETAPI and contains none of their code.
- The cover shows the Trilium logo, from the
  [TriliumNext repository](https://github.com/TriliumNext/Trilium).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Trilium Notes or
TriliumNext.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
