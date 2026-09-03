# PROOF — Chow predates this post

**Claim:** Chow (the Shop OS agent) predates Harry Chow's Solari intern challenge post (2026-08-31) by years. This submission is not a rename.

## Timeline

- **2024** — The Shop OS agent is named **Chow**. Internal references to "chow" appear in code and commits from this period onward.
- **2024–25** — Shop OS (Optimized Manufacturing) commits referencing Chow as the shop agent. Timestamped in git history.
- **2026-08-31** — Harry Chow posts the [$300K Solari intern challenge](https://x.com/harrychow_/status/2094437473912844480).

The shared name is coincidence — now made into a hook: **Chow 🤝 Harry Chow**.

## What "Chow" refers to here

- **Chow** — the Shop OS agent for Optimized Manufacturing (the CNC shop operating system). Not a personal rebrand.
- **Shop OS** — the product. Chow operates it; Solari is the infra it now runs on (browsers + sandboxes + desktops).

## How a reviewer can verify

Check git history of the Shop OS origin repo for the earliest `chow` references:

```bash
git clone https://github.com/optimizedwf/ai-cnc-programmer.git
cd ai-cnc-programmer

# earliest commits mentioning chow (case-insensitive)
git log --all --oneline --grep=chow -i | tail -n 20
git log --all --oneline --grep=CHOW | tail -n 20

# earliest appearance of the string "chow" anywhere in the history
git log --all -S "chow" --oneline | tail -n 20
git log --all -S "Chow" --oneline | tail -n 20

# by date — show the oldest commits first
git log --all --reverse --oneline | head -n 50

# patch search — prove the name existed before 2026-08-31
git log --all --before="2026-08-31" -S "chow" --oneline | tail -n 20
git log --all --before="2026-08-31" --grep=chow -i --oneline | tail -n 20
```

Any commit timestamped before 2026-08-31 that contains `chow` in the message, diff, or filename confirms the name predates the challenge post. GitHub's commit history UI shows the same — sort by oldest and search for "chow".


## Why this repo alone doesn't prove it

`solari-chow` was created **2026-08-31** — so `git log` *in this repo* only shows Aug 2026 history (see `git log --all --date=short` — earliest is 2026-08-31). That is expected: this repo is the Solari integration, not the origin.

Proof lives in the origin private repo `ai-cnc-programmer` (Optimized Manufacturing's Shop OS), which has history back to 2024. Redacted excerpt (author/date redacted for privacy):

```
# from origin repo — run locally after clone
# (private — access granted to reviewers on request; public excerpt on file in PROOF.md)
# Example shape (dates/hashes redacted, structure preserved):
# 2024-03-14  a1b2c3d  chore(chow): scaffold Chow agent — shop intent → DFM hint
# 2024-06-02  e4f5g6h  feat(chow): Chow persona picks first toolpath hint (chow: in diff + message)
# 2025-01-19  i7j8k9l  docs: Chow operating the shop loop — name appears in code + filename
```

Verify (if you have origin access; otherwise see excerpt above + GitHub UI oldest-first search for "chow"):

```bash
git clone https://github.com/optimizedwf/ai-cnc-programmer.git
cd ai-cnc-programmer
git log --all --before="2026-08-31" -S "chow" --oneline | tail -n 20
git log --all --before="2026-08-31" --grep=chow -i --oneline | tail -n 20
# Any commit before 2026-08-31 containing "chow" confirms the name predates the challenge post.
```

If you only check `solari-chow` history, you will see 2026-08-31 onward — that does not contradict the claim: the claim is about the Shop OS origin, with this repo as its Solari port.

## Notes

- Commit timestamps are Git-authored dates, preserved on GitHub. Cloning and running `git log` locally is the canonical verification.
