# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds: the Trilium address and an ETAPI token, kept by
Gladys in the integration configuration (never logged, never written to
`/data`). `/data` holds a small JSON file with the Trilium instance id (the
creation time of its root note), the time and ids of the newest note change
already seen by the scene triggers, and the changes written by the integration
itself. The container only talks to the Trilium address, over HTTP or HTTPS.
With the token it reads the titles, dates and labels of the notes (never the
content of a note, but the day note a scene writes in), and it writes only what
a scene action asks for: a line added at the end of the day note, or a new note
with its labels. It never deletes nor moves anything. An ETAPI token gives full
access to the notes: keep it as secret as the password of Trilium.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Trilium itself (see the
[TriliumNext security policy](https://github.com/TriliumNext/Trilium/security/policy)).
