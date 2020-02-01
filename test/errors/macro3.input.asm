* = $801

    +foo(1,2)  ; forward references are only allowed for PC labels

!macro foo(a, b) {
    lda #a
    lda #b
}

    jmp dummy  ; require another pass of compilation, required for complete error checks for macro scope viz
    nop
dummy:
