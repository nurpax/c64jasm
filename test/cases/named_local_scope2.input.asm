* = $801

!let a = 0

lbl1: !if (a) {
foo: lda #0
} else {
foo: lda #1  ; this should get compiled
}


lbl2: !if (a != 0) {
foo: lda #0
} elif (a == 13) {
foo: lda #1
} else {
foo: lda #2  ; this should get compiled
}

    lda #13
    sta lbl1::foo-1
    sta lbl2::foo-1
