* = $801


!macro jmptest(~a) {
    jmp a
}

    +jmptest(foobar)
foobar:
    lda #0
