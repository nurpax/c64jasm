* = $801

outer: {
    nop
    lda #0
inner:
    rts
}

outer2: {
    inner: {
        innermost:{
            lda #0
        }
    }
    rts
}

    lda #1
    sta outer::inner-1
    nop
    sta outer2::inner::innermost
    sta outer2::inner::innermost+1
