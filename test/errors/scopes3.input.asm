* = $801

outer: {
    lda #1
inner:
    rts
}

    lda #1
    sta outer::inner-1       ; this should work
    sta outer::inner2-1      ; this should not work
