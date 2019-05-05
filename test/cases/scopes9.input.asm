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
    !let x = ::outer::inner::inner - 1
    sta x ; ::outer::inner::inner
