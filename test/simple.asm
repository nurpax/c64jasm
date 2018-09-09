
wait_first_line:
    ldx $d012
    lda $d011
    and #128 
    bne wait_first_line
    cpx #0
    bne wait_first_line
    lda #0
    sta $d020
    sta $d021
    