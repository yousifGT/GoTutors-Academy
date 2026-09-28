# The marking brain

Everything the marker has learned — every mark scheme, every question, and every
worked example a tutor checked or corrected — kept as plain Markdown notes in an
Obsidian vault on the centre's own machine.

## The thing to understand first

**The learning never lived inside the AI provider.** Each time a tutor checks or
corrects a mark, the app saves the student's answer, the mark and the comment in
its *own* database, and replays the best of them into the prompt the next time
that question is marked. The model itself remembers nothing between papers.

So switching from Claude to another provider — or to a model running on the
Mac mini — costs nothing in learning. The new model is handed the same worked
examples on its very first paper. There is no re-learning period and no tokens
spent working things out again.

What the vault adds is independence from *this app and this database* as well:
open files a person can read, that survive a rebuild, and that can be loaded
into a fresh install.

The one thing worth doing before switching provider is running the bench on your
own papers: a different model may read the same examples differently. That is a
one-off check costing a few pounds, not an ongoing cost.

## Export

```bash
npm run brain:export                               # writes ./brain-vault
npm run brain:export -- --out ~/Obsidian/Marking   # straight into your vault
```

This writes a `Marker Brain` folder:

| Note | What's in it |
|---|---|
| `Home` | Totals, and a link to every mark scheme |
| `Schemes/<title>` | The scheme, and a link to each of its questions |
| `Questions/<title> — Q<label>` | The question, the expected answer, how to award marks, and every worked example |

Open the folder in Obsidian and the graph view shows the brain: schemes linked to
their questions, questions linked back.

It is safe to run as often as you like. It only rewrites notes whose content
changed, so a nightly run doesn't make every note look new. It removes notes for
schemes and questions that no longer exist. **It never touches a note it didn't
write** — keep your own notes in the same folder if you want; they are left
alone.

Don't edit the exported notes themselves. The next export overwrites them.
Changes to marking belong in the app.

## Import

```bash
npm run brain:import -- --dry-run                  # show what would change
npm run brain:import -- --from ~/Obsidian/Marking  # load it
```

For restoring onto a new machine or into a fresh install. It merges rather than
replaces:

- a mark scheme is matched by its title, and created if missing;
- a question is matched by its label, and created if missing — an existing
  question's wording is never changed;
- a worked example that is already there is skipped, so importing the same vault
  twice adds nothing the second time.

Nothing is ever deleted.

Verified end to end: a brain exported from one database, imported into an empty
one and exported again comes out byte-identical.

## Nightly export on the Mac mini

Save this as `~/Library/LaunchAgents/com.marker.brain-export.plist`, with the
paths changed to yours, then run
`launchctl load ~/Library/LaunchAgents/com.marker.brain-export.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.marker.brain-export</string>
  <key>WorkingDirectory</key><string>/Users/you/marker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/npm</string>
    <string>run</string>
    <string>brain:export</string>
    <string>--</string>
    <string>--out</string>
    <string>/Users/you/Obsidian/Marking</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DATABASE_URL</key><string>postgresql://marker:marker@127.0.0.1:5434/marker</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/marker-brain-export.log</string>
  <key>StandardErrorPath</key><string>/tmp/marker-brain-export.log</string>
</dict>
</plist>
```

That gives you a fresh copy of the brain every night, in a form that doesn't
depend on the database being healthy — which also makes it a readable backup of
the one thing that is hardest to rebuild.

## Privacy

The vault contains children's answers. No names, no admission numbers and no
link back to the paper they came from are ever written — but it is still their
work, and a child who wrote their name in an answer box is the one thing no
format can prevent.

**Keep it on the centre's machine.** Don't turn on Obsidian Sync or iCloud for
this vault, and don't commit it to git — `brain-vault/` is gitignored for that
reason. If you back it up off-site, encrypt the backup.
