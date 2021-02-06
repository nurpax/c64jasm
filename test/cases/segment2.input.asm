
!let a = $1000

!segment code(start=a, end=a+16)

!segment code
    lda #0    ; default segment
    lda #1
    lda #2
    lda #3
