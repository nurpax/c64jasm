* = $801

!macro foo(a, b) {
    lda #a
    bne _lbl1
    lda #b
_lbl1:
}

    +foo(1, 2)
    +foo(7, 1<<3)
