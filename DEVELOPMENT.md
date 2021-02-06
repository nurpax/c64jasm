# Developing c64jasm

Usual development flow:

- On first run, or whenever you edit the `parser.pegjs` file: `npm run gen`
- During development, start TypeScript watch compiler to trigger rebuilds on changes: `npm run watch`
- To run tests: `npm run test`
- To compile an .asm file, run e.g. `npm run asm ./test/cases/simplest2.input.asm --disasm --out /dev/null`.  This use the same CLI as c64jasm uses when installed.

## Building an installable npm package

```
npm run dist
npm pack
```

This will produce a file called `c64jasm-<version>.tgz` (e.g., `c64jasm-v0.8.2-beta0.tgz`).

If you want to install it globally (so that you can just do `c64jasm` anywhere in your shell), do:

```
npm install -g c64jasm-<version>.tgz
```
