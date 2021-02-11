; disasm: debuginfo

!segment code(start=$80a, end=$819)
!segment data(start=$81a, end=$830)

* = $801
    lda #0    ; default segment

!segment code ; use code segment
    lda #1    ; should be at address $1000
    lda #2

!segment data
!byte 0,1,2,3

!segment code ; emit to code segment
    lda #3
    lda #4
