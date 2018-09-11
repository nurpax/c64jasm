* = $801
wait_first_line:
    lda #<test
    sta lbl
    lda #>test
    sta lbl + 1
    jmp (lbl)
    bne test
test:
    rts

lbl: 
    !word 0