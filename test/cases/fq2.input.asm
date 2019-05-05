
* = $801

scope1: {
scope2: {
bar: lda #15
baz: lda #16
}
batman: lda #16
}

    lda #::scope1                  ; loads 01 ($801)
    lda #::scope1::scope2::bar     ; loads 01 ($801)
    lda #::scope1::scope2::baz     ; loads 03 ($803)
    lda #::scope1::batman          ; loads 05 ($805)
