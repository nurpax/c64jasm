; disasm: debuginfo

!segment code(start=$810, end=$813)
!segment data(start=$814, end=$817)

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
