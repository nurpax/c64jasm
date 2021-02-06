
!segment code(start=$1000, end=$1100)

!segment code
* = $900        ; underflows start of segment
* = $1000
    lda #0
    lda #1
