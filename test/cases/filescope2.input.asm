
* = $801

    jsr part1::init

    lda #13
    sta state::foo

state: {
    foo: !byte 0
}

!include "filescope.asm" ; sticks everything under 'part1'
