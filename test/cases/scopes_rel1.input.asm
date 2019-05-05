
* = $801

scope1: {
bar: lda #15
baz: lda #16
     lda #bar
     lda #baz
     jmp scope1
}

    lda #scope1        ; loads 01 ($801)
    lda #scope1::bar   ; loads 01 ($801)
    lda #::scope1::baz   ; loads 03 ($803)
