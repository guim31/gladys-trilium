# Trilium Notes

Connect Gladys to [Trilium Notes](https://triliumnotes.org) (TriliumNext), the
self-hosted hierarchical note-taking application: follow your counters and your
open to-dos, react when a note is created or changed, create notes from your
scenes, and keep a journal of the house in the day note of Trilium, which Gladys
fills in line by line. Everything stays on your local network: Gladys talks
directly to your Trilium server, through its ETAPI.

Tested against a real TriliumNext v0.106.1 (the `triliumnext/trilium` Docker
image). Feedback welcome on the Gladys forum.

## Prerequisites

- Gladys Assistant 5.1 or later.
- A Trilium server reachable from the Gladys machine: TriliumNext (tested with
  0.106.1; older versions with the ETAPI may work, untested). The desktop application
  alone has no server: use its server edition, or a synchronization server.
- An ETAPI token: in Trilium, open **Options → ETAPI** and click **Create new
  ETAPI token**. Copy it: it is shown once.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **Trilium address**, enter the address you open Trilium at, for example
   `192.168.1.50:8080` or `https://notes.example.org`.
3. Paste the **ETAPI token**.
4. **Read Trilium every**: 5, 15 (default), 30 or 60 minutes. Changed notes
   are announced at the next read.
5. **To-do label**: the label of your to-dos, `todo` by default. A to-do is
   open while the note carries this label and not the label `#done`.
6. **Language of names and messages** sets the feature names (fixed when the
   device is added) and the texts of the integration. French by default.
7. Save, then use **Test the connection**: it shows the version of Trilium and
   the number of notes.
8. In the **Discovery** tab, add the **Trilium** device.

## Devices

**Trilium** (one device for the server):

| Feature             | Value                                               |
| ------------------- | --------------------------------------------------- |
| Notes               | number of notes (archived and hidden ones excepted) |
| Notes changed today | notes created or changed since midnight             |
| Open to-dos         | notes with the to-do label and without `#done`      |
| Latest changed note | title of the note created or changed most lately    |

The counters keep their history. The device keeps its identity when the
address of the server changes.

## Dashboard widget

**Trilium**: three tiles (notes, changed today, to-dos) and the eight notes
changed last, with the time of the change. In the widget settings, **Label**
(for example `todo` or `shopping`) lists the notes carrying it and not `#done`
instead: a to-do list on the dashboard. **Hide the counters** keeps the list
only. When Trilium is reached over https, each note opens in Trilium.

## Scene triggers

- **Trilium note created or updated**: a note is created or changed in
  Trilium. Filter: **Change** (created, updated, or empty: both).
- **Labeled Trilium note changed**: the same, for the notes carrying a label:
  **Label** (required, the label name without `#`, exactly as written in
  Trilium, e.g. `todo`) and **Change**. The inherited labels and those of a
  template count. A note with several labels fires once per label name, so a
  scene set on one label runs once.

Variables: **Note title**, **Change** (`created` or `updated`), **Note
address**, **Labels** (the labels of the note itself, as `#name=value`),
**Note id**, and **Label** for the second trigger.

The first read after the installation is silent: the notes already there are
not announced. The notes written by this integration are never announced. At
most ten notes are announced per read, the oldest first; the next ones wait for
the next read. Past 50 changes between two reads (an import), ten are announced
and the rest is counted as seen.

## Scene actions

- **Add a line to the Trilium day note**: **Line**, added at the end of the
  note of today in the journal of Trilium, as a new paragraph, starting with the
  time unless **Start with the time** is off. Trilium creates the day note (and
  its month and year) when it is missing, from your day template if you have
  one. The line is written as plain text.
- **Create a Trilium note**: **Title**, and optionally **Parent note** (the
  exact title or the id of an existing note; empty: the root), **Content**
  (plain text, one paragraph per line) and **Labels** (separated by commas,
  `name=value` for a label with a value). The to-do label (`todo` by default)
  makes it a to-do. An
  unknown parent is an error: the integration never creates one.

Both return **Note id**, **Note title** and **Note address**; **Create a
Trilium note** also returns **Parent note**.

## Scene examples

- **House journal**: when the boiler pressure drops below 1 bar → **Add a line
  to the Trilium day note**, "Boiler pressure below 1 bar". Each day, the day
  note keeps what happened in the house.
- **Voice to-do**: a voice scene → **Create a Trilium note**, parent
  `Shopping`, title from the request, labels `todo`. The **Open to-dos**
  counter and the widget show it.
- **Know what changed**: trigger **Labeled Trilium note changed**, label
  `family` → send a message "{{triggerEvent.data.note_title}} was updated".
- **To-dos reminder**: every evening, when **Open to-dos** is above 5 → send a
  message.

## Troubleshooting

- **"Trilium refused the ETAPI token"**: the token was deleted or mistyped.
  Create a new one in Options → ETAPI.
- **"Trilium does not answer"**: check the address and the port from the Gladys
  machine. The container uses a bridge network: `localhost` is the container
  itself, enter the IP address of the server instead.
- **"Trilium answers at another address"**: the address redirects, usually
  from http to https. Enter the address your browser ends up at, with
  `https://`.
- **"This address does not answer like Trilium"**: a proxy login page answers
  instead of Trilium. Enter the address of Trilium itself.
- **"The day note is protected"**: Trilium does not give the content of a
  protected note to the ETAPI. Unprotect the journal, or write elsewhere with
  **Create a Trilium note**.
- To see more in the logs of the integration, set `LOG_LEVEL=debug`.

## Limits

- The triggers fire at the next read (15 minutes by default), not instantly:
  Trilium pushes nothing. Notes deleted or moved are not announced, nor a label
  added alone (Trilium leaves the note's modification time unchanged); a note
  saved several times between two reads is announced once.
- Protected notes are counted, but their content is never read nor written,
  and their title shows as "Protected note".
- Archived notes are left out everywhere: counters, to-dos and triggers.
- A read is a handful of ETAPI searches. The counts read the list of matching
  notes as a stream, without keeping it: a base of tens of thousands of notes
  fits in the memory of the container, but takes a little longer to count.
- The integration never deletes nor moves anything in Trilium.
- Not affiliated with Trilium Notes nor TriliumNext.
