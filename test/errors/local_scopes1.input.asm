* = $801

!let a = 0

!if (a == 0) {
    !let x = 0
    !let x = 1  ; duplicate variable
    lda #x
}

!if (a == 0) {
    !let x = 1
    lda #x
}
    lda #2
