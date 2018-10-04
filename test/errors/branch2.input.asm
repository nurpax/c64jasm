* = $801
    lda #0
nextline:
    !fill 127,$ea
    bne nextline
    rts
