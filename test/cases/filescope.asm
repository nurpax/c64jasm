; just a comment line to test that 'no-op' lines are ok
; when looking for first source line for !filescope
; "must be first directive" error check
!filescope part1

init: {
    lda #0
    sta state::foo
    rts
}

state: {
    foo: !byte 0
}
