* = $801
wait_first_line:
    lda #0
    bne wait_first_line
    bne nextline
nextline:
    rts
