!filescope part1

init: {
    lda #0
    sta state::foo
    rts
}

state: {
    foo: !byte 0
}
