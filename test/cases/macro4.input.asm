* = $801

!macro foo(a, b) {
    lda #a
    bne .lbl1
    lda #b
.lbl1:
}

    +foo(1, 2)
    +foo(7, 1<<3)
