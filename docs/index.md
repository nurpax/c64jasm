---
title: C64jasm -- The extensible C64 symbolic assembler and VSCode environment
---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Assembler](#assembler)

## Overview

C64jasm is a C64 symbolic assembler that supports:

- Windows, Linux and macOS (it runs on [Node.js](https://nodejs.org/en/))
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

You should try that it successfully runs when you type `c64jasm --help` in your shell.

VSCode extension:

Search for `c64jasm` in the VSCode marketplace and install.

VICE:

See [VICE website](http://vice-emu.sourceforge.net/) for download and installation instructions.  Once you have it installed, make sure the VICE emulator binary `x64` is in your PATH.

## Assembler

C64jasm has fairly extensive symbolic macro assembly support.  This includes macros, compile-time variables, for-loops, if/else, and source and binary file inclusion.

Assembler pseudo directives start with a bang '`!`'.  Examples: `!let`, `!if`, `!include`.

#### Labels and nested label scopes

```
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

A label followed by braces '`{}`' starts a new scope.  Labels declared inside the braces will be local to that scope.  Labels declared within such a scope can still be referenced by using the namespacing operator `::`, e.g.,

```
memset256: {
    ldx #0
loop:
    sta $1234, x
ptr:
    inx
    bne loop
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

#### Data directives

Emitting bytes/words:

```
foo:  !byte 0     ; declare 8-bit
bar:  !word 0     ; declare 16-bit int (2 bytes)
baz:  !byte 0,1,2 ; declare bytes 0,1,2

baz_256: ; 256 bytes of zero
    !fill 256, 0
```

Including binary data:

```
!binary "file1.bin"       ; all of file1.bin
!binary "file2.bin",256   ; first 256 bytes of file
!binary "file2.bin",256,8 ; 256 bytes from offset 8
```


#### Variables

You can declare a variable with `!let`.  You can use standard C operations like `+`, `-`, `*`, `/`, `<<`, `>>` with them.

```
!let num_sprites = 4

    lda #(1 << num_sprites)-1
    sta $d015
```

Variable take on JavaScript values such as numbers, strings, arrays and objects.  We will explore later in this document why array and object values are useful.

#### If/else

Conditional assembly is supported by `!if/elif/else`.

```
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

#### For-loops

To repeat a particular set of instructions or data statements, use `!for`.

Repeating code generation.  For-loops are typically written using the built-in `range()` function that returns an array of integers.  This works similar to Python's `range` built-in.

```
!let xyptr = $40   ; alias zero-page $40 to xyptr

; shift left xyptr by 5 (e.g., xyptr<<5)
!for i in range(5) {
    asl xyptr
    rol xyptr+1
}
```

Lookup table generation:
```
    lda #3            ; index == 3
    tax
    lda shift_lut, x  ; A = 1<<3

; Create a left shift lookup table
shift_lut:
    !for i in range(8) {
        !byte 1<<i
    }
```


#### Macros

Macros are declared using the `!macro` keyword and expanded by `+macroname()`.

```
; move an immediate value to a memory location
!macro mov8imm(dst, imm) {
    lda #imm
    sta dst
}

+mov8imm($40, 13)  ; writes 13 to zero page $40
```

#### JavaScript extensions

You can call into JavaScript modules directly from your assembly source code.  This is a powerful mechanism for implementing lookup table generators, graphics format converters, etc.

## Release history

c64jasm 0.3.0:
- Improved scoping support, relative name references.  Various bug fixes.

c64jasm 0.2.0:
- Support "server" mode for debug info.  Required for VSCode+VICE source level debugging.
