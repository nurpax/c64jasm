
!segment code(start=$100, end=$103)
!segment code
    lda #0 ; $100, $101
    lda #1 ; $102, $103
    lda #2 ; $104 is already out of bounds, error on this line
