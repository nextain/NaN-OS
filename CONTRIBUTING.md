# Contributing

## You don't need to ask anyone

Clone the repo. Open it with any AI coding tool. Ask in your language:

> "What is this project about and how can I help?"

The `.agents/` directory gives AI full project context. It will explain the vision, architecture, roadmap, and what you can work on — **in whatever language you speak**.

## Any language is welcome

Write issues, PRs, comments, and code reviews in **any language**. Maintainers use AI translation. Don't let language stop you.

Code and commit messages should be in English — but if you can't, submit anyway. We'll help.

## Ways to contribute

Pick whatever interests you:

- **Translation** — Add your language to `READMES/` or `.users/context/<lang>/`
- **Skills** — Create a new AI skill in `agent/assets/default-skills/`
- **Bug reports** — Open an issue describing what went wrong
- **Code** — Pick an issue, submit a PR
- **Documentation** — Improve docs in `.users/context/`
- **Testing** — Try the app and share feedback

## Getting started

```bash
git clone https://github.com/nextain/naia-os.git
cd naia-os/shell && pnpm install
cd ../agent && pnpm install
cd ../shell && pnpm run tauri dev
```

Prerequisites: Linux, Node.js 22+, pnpm, Rust stable, webkit2gtk-4.1-dev

## Submitting a PR

1. Fork & create a branch
2. Make your changes
3. `pnpm test` (if you changed code)
4. Open a PR — a short description is enough

## License

- **Code**: Apache 2.0
- **AI context** (`.agents/`, `.users/`): CC-BY-SA 4.0

By contributing, you agree to these terms.
