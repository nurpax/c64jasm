* = $801
    lda #0
!let addr = $080d
!if (addr >= 10000) {
    lda #1
}
!if (addr >= 1000) {
    lda #2
}
!if (addr >= 100) {
    lda #3
}
!if (addr >= 10) {
    lda #4
}
    lda #5
