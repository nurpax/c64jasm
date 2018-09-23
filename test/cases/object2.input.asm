; nested scopes
* = $801

foo: {
!for i in `obj.test {
    lda #i
}
!if (`obj.test[0] == 0) {
    lda #16
} else {
    lda #17
}
!if (`obj.test[1] == 1) {
    lda #32
} else {
    lda #33
}
    rts
}