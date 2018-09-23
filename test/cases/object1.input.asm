; nested scopes


* = $801

foo: {
!if (`obj.xyz == 0) {
    lda #1
} else {
    lda #2
}

!if (`obj.xyz == 13) {
    lda #3
} else {
    lda #4
}
    rts
}