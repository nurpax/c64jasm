* = $801

!macro m() {
    lda #0
}
    lda #m   ; should be an error
