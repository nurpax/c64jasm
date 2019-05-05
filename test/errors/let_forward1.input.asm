* = $801

entry: {
    !if (state_length >= 256) {             ; forward ref (state_length declare later in src file)
        !error "state vector too long"
    }
    lda #0
    ldx #0
clr:
    sta state, x
    inx
    cpx #state_length
    bne clr

!let state_length = state_end - state
!align 16
state:
    !byte 0, 1, 2, 3
state_end:
}
