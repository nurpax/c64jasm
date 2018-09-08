
lp:
    jmp lp

    jmp (lbl)
lbl:
!word wait_first_line

    !byte 0, 0, 13, 1+1
    !word 0

wait_first_line:
    ldx $d012
    lda $d011
    and #128  ; (1<<7)
    bne wait_first_line
    cpx #0
    bne wait_first_line
    lda #0
    sta $d020
    sta $d021

    ldx #0
waste_cycles:
    nop
    nop
    nop
    nop
    nop
    nop
    inx
    bne waste_cycles

    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    inc $d020
    jmp wait_first_line

!byte 1
!byte 2
!byte 1+3
!byte 4
!byte 10/2

    lda #0         ; foo
loop3:
    sta $d020       ; bar
loop2:sta $d020       ; bar
loop:
    inc $d020       ; bar
    bit $f0
    inc $d020       ; bar
    jmp loop
    jmp loop3

    lda foo

    lda #1+1
    lda #33/3
foo:
    !byte 0, 0, 13, 1+1
    !word 0
