
* = $801

scope1: {
bar: lda #15
baz: lda #16
     lda #bar
     lda #baz
scope2: {
barx:
    lda barx
    lda scope2
}
    lda scope2::barx
    jmp scope1
}

    lda #scope1
    lda #scope1::bar
    lda #scope1::scope2::barx
    lda #::scope1::baz
