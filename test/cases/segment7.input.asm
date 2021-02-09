
!let o = { s: $810, s2: $814 }
!segment code(start=o.s, end=o.s + 3)
!let sv = o.s2
!segment data(start=sv, end=$817)

* = $801
    lda #0
    jsr part_1

!segment code
part_1:
    rts

!segment data
!byte 0,1,2,3

!segment default
    lda #1
    jsr part_1
