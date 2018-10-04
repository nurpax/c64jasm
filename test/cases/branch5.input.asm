* = $801
    lda #0
    bne nextline
    !fill 127,$ea
nextline:
    rts
