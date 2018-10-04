* = $801
    lda #0
    bne nextline
    !fill 128,$ea
nextline:
    rts
