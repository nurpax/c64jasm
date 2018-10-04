* = $801
    lda #0
nextline:
    !fill 126,$ea
    bne nextline
    rts
