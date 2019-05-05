* = $801

entry: {
    !let len = state_end - state          ; forward ref variable bug?
    !if (len >= 256) {
        !error "state vector too long"
    }
    lda #0
    ldx #0
clr:
    sta state, x
    inx
    cpx #len
    bne clr

state:
    !byte 0, 1, 2, 3
state_end:
}
