* = $801

!macro foo(~lbl) {
    lda #0
lbl:
}

    +foo(x)
    ; write zero to expanded lda #0 immediate field
    sta x-1
