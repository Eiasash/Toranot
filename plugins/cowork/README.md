# cowork (Toranot)

Local Claude Code plugin that formalizes the `cowork/<topic>` branch + session-handoff workflow for **Toranot**: SZMC clinical notes + the rules engine in `src/engine/rules.ts`.

## Install (local)

```bash
# from repo root
mkdir -p .claude/plugins
ln -sfn "$PWD/plugins/cowork" .claude/plugins/cowork
```

Or reference as a marketplace entry in `~/.claude/settings.json`.

## Commands

| Command | Purpose |
|---|---|
| `/cowork:start <slug>` | Cut `cowork/<slug>`, scaffold `.cowork/<slug>.md` handoff, commit |
| `/cowork:handoff` | Write/refresh the handoff file: branch, staged diff, open todos, failing tests, next step |
| `/cowork:resume` | Read current branch's handoff, run `npm test`, summarize delta since handoff |
| `/cowork:status` | List every `cowork/*` branch: ahead/behind main, last handoff note, rule-count delta |
| `/cowork:land` | Rebase on main, enforce golden-rule invariant, run vitest + typecheck, prep squash message |
| `/cowork:sbar` | Generate Hebrew SBAR handoff for a SZMC note (rotation-level, not rules) |
| `/cowork:pair-rule <trigger>` | Pair-program a new clinical rule with the add-clinical-rule skill |

## Agents

- `clinical-reviewer` — reviews a rule/note diff for golden-rule compliance, comfort-care suppression, Hebrew term consistency, and Beers/STOPP overlap.

## Hooks

- `SessionStart` — if the current branch is `cowork/*`, prints its handoff file and the last 5 commits so Claude can resume without prompting.

## Handoff file format

`.cowork/<slug>.md` — plain markdown, one per active topic. Committed so every session can read it.

```md
# <slug>

**Branch:** cowork/<slug>
**Last session:** 2026-04-18 (Claude Opus 4.7)
**Status:** in-progress | blocked | ready-to-land

## Goal
One paragraph.

## Done
- ...

## Next
- [ ] concrete next tool call

## Tests
- `npm test -- rules.polypharmacy` : PASS
- `npm run typecheck` : PASS

## Notes for the next Claude
Anything non-obvious.
```
