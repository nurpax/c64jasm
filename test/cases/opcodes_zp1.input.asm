* = $801
    lda $13,x   ; should be zero page
    lda $13,y   ; should be 16 bit

    ldx $13,y   ; should be zero page
    ldx $200,y ; should be 16 bit

    ldy $13,x   ; should be zero page
    ldy $200,x  ; should be 16 bit
