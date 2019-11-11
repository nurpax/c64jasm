---
title:  C64jasm
author: Janne Hellsten
---

## Overview

C64jasm is a symbolic assembler for the Commodore 64 that supports:

- Windows, Linux and macOS (it runs on [Node.js](https://nodejs.org/en/))
- fast, automatic recompilation (save a file and c64jasm automatically recompiles your .prg)
- extensions: extend the assembler standard library in JavaScript.  See [this blog post](https://nurpax.github.io/posts/2018-11-08-c64jasm.html) for more details.
- integrates with VSCode for recompilation, error diagnostics and debugging on VICE directly from the VSCode editor.

C64jasm also runs in the browser, you can try this [interactive assembler demo](https://nurpax.github.io/c64jasm-browser/) to play with it.

C64jasm is free and open source -- its source code can be found here: [c64jasm on GitHub](https://github.com/nurpax/c64jasm).

## Installation

In order to use the c64jasm assembler, you need to install the following:

- [Node.js](https://nodejs.org/) (tested on node v11.12)
- [c64jasm command line compiler](https://www.npmjs.com/package/c64jasm)

Furthermore, if you wish to use c64jasm with VSCode, you should also install:

- [c64jasm VSCode extension](https://marketplace.visualstudio.com/items?itemName=nurpax.c64jasm)
- [VICE emulator](http://vice-emu.sourceforge.net/)

**Assembler installation**: `npm install -g c64jasm`

Upon successful installation, running `c64jasm --help` in your shell should work.

**VSCode extension**: Search for `c64jasm` in the VSCode marketplace and install.

**VICE**: See the [VICE website](http://vice-emu.sourceforge.net/) for download and installation instructions.  Once you have it installed, make sure the VICE emulator binary `x64` is in your `PATH`.

**Extras**: Vim users: C64jasm vim plugin for syntax highlighting and better editing support: [c64jasm plugin for vim](https://github.com/neochrome/vim-c64jasm)

## Getting started

Assuming you successfully installed the C64jasm command line compiler, you should be able to compile and run some code.  Let's build the `sprites` sample from under [examples/sprites/](https://github.com/nurpax/c64jasm/tree/master/examples/sprites/):

```
git clone https://github.com/nurpax/c64jasm
cd c64jasm/examples/sprites
c64jasm --out sprites.prg sprites.asm
x64 sprites.prg
```

You should see something like this in your VICE window:

<div style="text-align: center">
    <img src="img/sprites.gif" />
</div>

If you installed the necessary VSCode parts of VSCode, you should be able to load this example project in VSCode and build it with `Ctrl+Shift+P` + `Tasks: Run Build Task`.  Build errors will be reported under the Problems tab and you should be able to hit `F5` to start your program in VICE.

## Command line usage

Run `c64jasm --help` for all c64jasm command line options.

Basic usage:

```
c64jasm --out output.prg source.asm
```

where `output.prg` is the desired output `.prg` filename and `source.asm` is the assembly source you want to compile.

### Automatic recompilation (watch mode)

Like many modern compiler tools, c64jasm supports "watch mode".  Watch mode automatically recompiles your source code when any of the input source files change.  To use watch mode, invoke c64jasm with the `--watch <DIR>` argument as follows:

```
c64jasm --out output.prg --watch src src/source.asm
```

C64jasm will watch the directory specified with `--watch <DIR>` (and its subdirectories) for any changes and recompile when anything changed.  Changes to all types of input files (.asm files, plugin .js files, files loaded by .js extensions, `!include/binary`'d files, etc.) are considered as rebuild triggers.

A good project structure that makes it easy to work with watch mode is to place all your source files and assets under a single root directory, say `src`.  This makes it easy to specify the watched directory with a single `--watch src` argument.

Watch mode works well with VSCode.  The `.vscode` configs for [examples/](https://github.com/nurpax/c64jasm/tree/master/examples/) are setup to use watched compiles.

## Macro assembler

C64jasm has fairly extensive symbolic macro assembly support.  This includes macros, compile-time variables, for-loops, if/else, and source and binary file inclusion.

Assembler pseudo directives start with a bang `!`.  Examples: `!let`, `!if`, `!include`.

### Labels and nested label scopes

```c64
; Clear the screen RAM (all 1024 bytes)
clear_screen: {
    lda #$20
    ldx #0
loop:
    sta $0400, x
    sta $0400 + $100, x
    sta $0400 + $200, x
    sta $0400 + $300, x
    inx
    bne loop
    rts
}
```

A label followed by braces `{}` starts a new scope.  Labels declared inside the braces will be local to that scope.  Labels declared within such a scope can still be referenced by using the namespacing operator `::`, e.g.,

```c64
memset256: {
    ldx #0
loop:
    sta $1234, x
ptr:
    inx
    bne loop
    rts
}

; Use self-modifying code to set target ptr
; for a memset

    lda #<buf           ; take lo byte of 'buf' address
    sta memset256::ptr-2
    lda #>buf           ; take hi byte of 'buf' address
    sta memset256::ptr-1
    jsr memset256

buf: !fill 256, 0
```

You can guard a whole file inside a scope if you start the source file with `!filescope`:

```c64
; Contents of util.asm
!filescope util

!macro inc_border() {
    inc $d020
}
```

Using `util.asm` from another file:

```c64
; Contents of main.asm
!include "util.asm"

    +util::inc_border()
```

Symbol references are relative to the current scope.  If you need to reference a symbol in the root scope, use `::foo::bar`:

```c64
bar: {
    !let foo = 20
}

foo: {
    bar: {
        !let foo = 0
    }
    lda #bar::foo    ; evaluates to 0
    lda #::bar::foo  ; evaluates to 20
}
```

The implicit `*` label always points to the current line's address.  You can use it to for example jump over the next instruction:

```c64
    bcc *+3
    nop
    ; bcc jumps here if carry clear
```

### Data directives

Emitting bytes/words:

```c64
foo:  !byte 0     ; declare 8-bit
bar:  !word 0     ; declare 16-bit int (2 bytes)
baz:  !byte 0,1,2 ; declare bytes 0,1,2

baz_256: ; 256 bytes of zero
    !fill 256, 0
```

Including other source files:

```c64
!include "macros.asm"
```

Including binary data:

```c64
!binary "file1.bin"       ; all of file1.bin
!binary "file2.bin",256   ; first 256 bytes of file
!binary "file2.bin",256,8 ; 256 bytes from offset 8
```

### Variables

You can declare a variable with `!let`.  You can use standard C operators like `+`, `-`, `*`, `/`, `<<`, `>>`, `&`, `|`, `~` with them.

```c64
!let num_sprites = 4

    lda #(1 << num_sprites)-1
    sta $d015
```

Variable assignment:

```c64
!let a = 0   ; declare 'a'
a = 1        ; assign 1 to 'a'
!! a = 1     ; assign 1 to 'a' (same as above, see Statements)
```

Variables take on JavaScript values such as numbers, strings, arrays and objects.  We will explore later in this document why array and object values are useful.

Array literals:

```c64
!let foo = [0,2,4]
    lda #foo[1]      ; emits LDA #02
```

Object literals:

```c64
; Declare zero-page offset helper

!let zp = {
    tmp0: $20,
    sprite_idx: $22
}

    lda #3
    sta zp.sprite_idx
```

### If...else

Conditional assembly is supported by `!if`/`elif`/`else`.

```c64
!let debug = 1

!if (debug) { ; set border color to measure frame time
    inc $d020
}
    ; Play music or do some other expensive thing
    jsr play_music
!if (debug) {
    dec $d020
}
```

### For-loops

Use `!for` to repeat a particular set of instructions or data statements.

For-loops are typically written using the built-in `range()` function that returns an array of integers.  This works similar to Python's `range` built-in.

```c64
!let xyptr = $40   ; alias zero-page $40 to xyptr

; shift left xyptr by 5 (e.g., xyptr<<5)
!for i in range(5) {
    asl xyptr
    rol xyptr+1
}
```

Lookup table generation:

```c64
    lda #3            ; index == 3
    tax
    lda shift_lut, x  ; A = 1<<3

; Create a left shift lookup table
shift_lut:
    !for i in range(8) {
        !byte 1<<i
    }
```

If you want to loop over some small set of fixed values (say `1`, `10`, `100`), you can use array literals with `!for`:

```c64
!for i in [1, 10, 100] {
    ...
}
```

### Statements

Statements such as variable assignment or calling a plugin function for just its side-effect is expressed by starting the line with `!!`:

```c64
; 'my_log' would be a JavaScript extension in your project
!use "my_log_plugin" as log

!let a = 0
!! a = 1   ; assign 1 to 'a'

!! log.print("hello")   ; console.log()
```

### Macros

Macros are declared using the `!macro` keyword and expanded by `+macroname()`.

```c64
; move an immediate value to a memory location
!macro mov8imm(dst, imm) {
    lda #imm
    sta dst
}

+mov8imm($40, 13)  ; writes 13 to zero page $40
```

Any labels or variables defined inside a macro definition will be local to that macro.  For example, the below code is fine -- the `loop` label will not conflict:

```c64
; clear 16 bytes starting at 'addr'
!macro memset16(addr) {
    ldx #15
loop:
    sta addr, x
    dex
    bpl loop
}

+memset16(buffer0)
+memset16(buffer0) ; this is ok, loop will not conflict
```

However, sometimes you _do_ want the macro expanded labels to be visible to the outside scope.  You can make them visible by giving the (normally anonymous) macro expansion scope a name by declaring a label on the same line as your macro expand:

```c64
; A = lo byte of memory address
; B = hi byte of memory address
clear_memory: {
    sta memset::loop+1
    stx memset::loop+2
memset: +memset16($1234)  ; macro labels are under memset
    rts
}
```

### Built-in functions

C64jasm injects some commonly used functionality into the global scope.

* `range(len)`: Return an array of `len` elements `[0, 1, .., len-1]`
* `range(start, end)` : Return an array of elements `[start, start+1, .., end-1]`
* `loadJson(filename)`: Load a JSON file `filename`

All JavaScript `Math` constants and functions (except `Math.random`) are available in the `Math` object:

Constants: `Math.E`, `Math.PI`, `Math.SQRT2`, `Math.SQRT1_2`, `Math.LN2`, `Math.LN10`, `Math.LOG2E`, `Math.LOG10E`.

Functions: `Math.abs(x)`, `Math.acos(x)`, `Math.asin(x)`, `Math.atan(x)`, `Math.atan2(y, x)`, `Math.ceil(x)`, `Math.cos(x)`, `Math.exp(x)`, `Math.floor(x)`, `Math.log(x)`, `Math.max(x, y, z, ..., n)`, `Math.min(x, y, z, ..., n)`, `Math.pow(x, y)`, `Math.round(x)`, `Math.sin(x)`, `Math.sqrt(x)`, `Math.tan(x)`.

`Math.random()` is not allowed as using a non-deterministic random would lead to non-reproducible builds.  If you need a pseudo random number generator (PRNG), write a deterministic PRNG in JavaScript and use that instead.

## C64jasm <span style='color:red'>❤</span> JavaScript

Extending the assembler with JavaScript was the primary reason why C64jasm was built.  This is a powerful mechanism for implementing lookup table generators, graphics format converters, etc.

Learning resources on c64jasm extensions:

- the [examples/](https://github.com/nurpax/c64jasm/tree/master/examples/) folder
- [blog post on c64jasm design principles](https://nurpax.github.io/posts/2018-11-08-c64jasm.html)
- [blog post on the 'content-pipe' example project](https://nurpax.github.io/posts/2019-06-06-c64jasm-content-example.html) -- how to import PETSCII, sprites and SID tunes

### Making extensions

A c64jasm extension is simply a JavaScript file that exports a function ("default" export) or a JavaScript object containing functions (named exports).  The functions can be called from assembly and their return values can be operated on using standard c64jasm pseudo ops.

Minimal example:

math.js:

```
module.exports = {
    square: ({}, v) => {
        return v*v;
    }
}
```

test.asm:

```c64
!use "math" as math
!byte math.sqr(3)  ; produces 9
```

Here's another example.  Here we'll compute a sine table (see [examples/sprites](https://github.com/nurpax/c64jasm/tree/master/examples/sprites)).  This extension uses the JavaScript module "default export", ie. it exports just a single function, not an object of function properties.

sintab.js:
```
module.exports = ({}, len, scale) => {
    const res = Array(len).fill(0).map((v,i) => Math.sin(i/len * Math.PI * 2.0) * scale);
    return res; // return an array of length `len`
}
```

foo.asm:
```c64
!use "sintab" as sintab
!let SIN_LEN = 128
!let sinvals = sintab(SIN_LEN, 30)
sintab:
!for v in sinvals {
    !byte v
}
```


### JavaScript / assembly API

An extension function is declared as follows:

```
(context, ...args) => { return ... };
```

For example, if you're defining an extension function that takes one input argument, it must be declared as:

```
(context, arg0) => { return ... };
```

C64jasm calls an extension function with a `context` value that contains some extra functions for the extension to use.  The rest of the arguments (`...args`) come from the assembly source invocation.  For example:

```
!let v = math.sqr(3)
```

will be called as:

```
// const sqr = (context, arg0) => return arg0*arg0;
sqr(context, 3);
```

If your extensions doesn't need anything from the `context` parameter,
you can declare your extension function like so: `({}, arg0) => return arg0*arg0;`

#### What is the context parameter?

The `context` parameter contains functionality that an extension can use to load input files.  It may also be extended to contain functions for error reporting.

Currently (c64jasm 0.3), the `context` object contains the following properties:

- `readFileSync(filename)`: synchronously read a file and return it as a byte buffer
- `resolveRelative(filename)`: resolve a relative filename to an absolute path

A well-behaving extension would use these to load input files as follows:

```
const loadJson = ({readFileSync, resolveRelative}, fname) => {
    const json = JSON.parse(readFileSync(resolveRelative(filename)));
    return json;
}
module.exports = loadJson;
```

A relative filename is relative to the location of the assembly source file that called the extension.  E.g., assuming the following folder structure:

```
src/
  main.asm
  assets/
    petscii.json
```

Consider calling an extension with a filename `assets/petscii.json` from `main.asm`:

```c64
!use "json" as json
!let j = json("assets/petscii.json")
```

Suppose you invoke c64jasm outside of the `src` directory like: `c64jasm ./src/main.asm`.  As `main.asm` is being compiled, c64jasm knows it resides in `./src/main.asm` and with `resolveRelative`, an extension knows how to resolve `assets/petscii.json` to `./src/assets/petscii.json`.

#### Why do I need context.readFileSync?

You might be asking: why do I need `context.readFileSync` when I could just as well import Node's `readFileSync` and use that.

Using the c64jasm provided I/O functions is necessary as it allows for c64jasm to know about your input files.  For example, if you're running c64jasm in watch mode, it can cache all your input files if they didn't change since the previous compile.

### Rules of authoring extensions

- Use `context.readFileSync` for loading files.
- An extension must always return the same value when called with the same input arguments.  Global state in the plugin or calling non-deterministic functions such as `Math.random` will lead to inconsistent/broken build results.  This is because c64jasm aggressively caches the results of plugin invocations in watched compile mode.  Also plugin functions can be called multiple times during compilation (at minimum once per compilation pass).

A limited form of side-effects is permitted though.  It is OK for an extension function to return a closure that holds its internal state.  For example this code is fine:

```
module.exports = {
  create: ({}, initial) => {
    const stack = [initial];
    return {
      push: (elt) => {
        stack.push(elt)
      },
      pop: () => stack.pop(),
      top: () => {
        return stack[stack.length-1];
      }
    }
  }
}
```

Usage in assembler:

```c64
!use "stack" as stack
!let s = stack.create({ tmp0: $20 })
!let zp = s.top()
    lda #zp.tmp0
```

In this example, the `stack` array holds the state which can be manipulated by calls to `push(elt)`, `pop()`.

## Release notes

c64jasm 0.8.0 (released on 2019-11-11):
- Add support for the star-operand (e.g., `jmp *`, `inc *-3`, etc.) that returns the current program position.
- Support CRLF (\r\n) style line-ends.  Fixes [issue #61](https://github.com/nurpax/c64jasm/issues/61).

c64jasm 0.7.0 (released on 2019-07-05):
- Support for running c64jasm in the browser.  Try it out: https://nurpax.github.io/c64jasm-browser/
- Macros now bind their scope to the point of declaration, not point of expansion.  So they work a lot like normal functions now.  See [issue #56](https://github.com/nurpax/c64jasm/issues/56) for details.
- The disassembler was missing a $ sign in immediate fields.  So `LDA #FF` changed to `LDA #$FF`.
- Fix plugin function argument passing bug.  If a plugin function returned a function value, those returned functions were incorrectly called.  They'd receive their args as an array when they were supposed to get their args  destructured into positional parameters.

c64jasm 0.6.0 (released on 2019-07-26):
- Add object literals
- Add "smart disassembly": support disassembling only addresses that are known to contain machine code instructions.  Available in the CLI tool with --disasm.

c64jasm 0.5.1 (released on 2019-07-18):
- Allow uppercase hex in numeric literals.

c64jasm 0.5.0 (released on 2019-07-14):
- Add browser support.  Previous versions worked only on Node.js.
- Fix a parser bug that caused a syntax error for a valid input file.
- Improved error handling and code clean up.  Display typenames
more accurately in error messages.
- Include TypeScript d.ts files in the NPM package.  This enables using the c64jasm API in TypeScript with correct types.

c64jasm 0.4.0 (released on 2019-06-29):
- Improved error reporting.  C64jasm will not stop at first reported error but try to report as many relevant semantic errors as possible.  This can be useful when refactoring code.

c64jasm 0.3.0:
- Improved scoping support, relative name references.  Various bug fixes.

c64jasm 0.2.0:
- Support "server" mode for debug info.  Required for VSCode+VICE source level debugging.
