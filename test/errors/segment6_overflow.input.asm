
!segment code(start=$1000, end=$11ff)

!segment code
* = $2000       ; can't set PC past the current segment
* = $1050
    lda #0
    lda #1
