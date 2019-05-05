
* = $801

scope1: {
scope2: {
bar: lda #15
baz: lda #16
}
     lda #bar  			; not visible
     lda #baz			; not visible
}
