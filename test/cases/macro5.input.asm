* = $801

!let addr=0

!macro foo() {
    lda #0
lbl:
addr = lbl-1
}

    +foo()
    ; write zero to expanded lda #0 immediate field
    sta addr

    +foo()
    ; write zero to expanded lda #0 immediate field
    sta addr
