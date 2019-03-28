---
title: C64jasm -- The extensible C64 symbolic assembler and VSCode environment
---

# C64jasm

C64jasm is a C64 symbolic assembler that supports:

- multiplatform (runs on [Node.js](https://nodejs.org/en/))
- fast, automatic recompilation (save a file and c64jasm automatically recompiles your .prg)
- extensions: extend the assembler standard library in JavaScript.  See [this blog post](https://nurpax.github.io/posts/2018-11-08-c64jasm.html) for more details.
- integrates with VSCode for recompilation, error diagnostics and debugging on VICE directly from the VSCode editor.

## Installation

In order to use c64jasm with VSCode, you need the following installed:

- c64jasm command line compiler
- c64jasm VSCode extension
- [VICE emulator](http://vice-emu.sourceforge.net/)

Command line assembler:

```
npm install -g c64jasm
```

You should try that it successfullu runs when you type `c64jasm --help` in your shell.

VSCode extension:

Search for `c64jasm` in the VSCode marketplace and install.

VICE:

See [VICE website](http://vice-emu.sourceforge.net/) for download and installation instructions.  Once you have it installed, make sure the VICE emulator binary `x64` is in your PATH.

## Release history

c64jasm 0.2.0:
- Support "server" mode for debug info.  Required for VSCode+VICE source level debugging.
