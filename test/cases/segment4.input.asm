
!segment code2(start=$1012, end=$1019)
!segment code1(start=$1008, end=$1010)

* = $1000
    lda #0 ; this should be first in output

!segment code2
    lda #10 ; this third
    lda #11

!segment code1
    lda #4 ; this second
    lda #5

!segment code2
    lda #12 ; finally this
    lda #13
