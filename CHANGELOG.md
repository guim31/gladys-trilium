# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-30

### Added

- A Trilium device: notes, notes changed today, open to-dos (a label, `todo` by
  default, without `#done`), and the title of the latest changed note.
- The "Trilium" dashboard widget: three tiles and the notes changed last, or
  the open to-dos of a label.
- Scene triggers "Trilium note created or updated" (filtered by kind of change)
  and "Labeled Trilium note changed" (filtered by label), silent at
  installation, remembered across restarts.
- Scene actions "Add a line to the Trilium day note" (a timed journal in the
  calendar of Trilium) and "Create a Trilium note" (under a chosen note, with
  content and labels).
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-trilium/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-trilium/releases/tag/v1.0.0
