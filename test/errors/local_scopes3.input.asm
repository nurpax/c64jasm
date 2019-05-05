* = $801

!for i in range(2) {
    !let x = 0
    lda #i + x
}

!for i in range(2) {
    x = 1
    lda #i + x
}
