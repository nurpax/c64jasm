* = $801

!macro clear_state(start, end) {
    !let len = end - start
    !if (len >= 256) {
        !error "state vector too long"
    }
    lda #0
    ldx #0
clr:
    sta start, x
    inx
    cpx #len
    bne clr
}

entry: {
    +clear_state(state, state_end)

state:
    !byte 0, 1, 2, 3
state_end:
}
