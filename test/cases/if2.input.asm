
* = $801
    lda #1
!if (0) {
    rts
} else {
    lda #3
    sta $d020
}

!if (1) {
    rts
} else {
    lda #4
    sta $d020
}
