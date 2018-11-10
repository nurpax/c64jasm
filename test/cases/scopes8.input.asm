* = $801

outer: {
    inner: {
        inner:{
            lda #0
        }
    }
    rts
}

    lda #1
    sta outer.inner.inner-1
