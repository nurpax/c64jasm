; disasm: cycles

* = $8c0


    jmp lbl1 ; 3 cycles
    ; below are all within single page, so 2 not taken, 3 taken
    bmi lbl1 ; 2/3
    bpl lbl1 ; 2/3
    bcc lbl1 ; 2/3
    bcs lbl1 ; 2/3
    beq lbl1 ; 2/3
    bne lbl1 ; 2/3
    bvc lbl1 ; 2/3
    bvs lbl1 ; 2/3
lbl1:

    nop

    ; should be 3/4 - 3 for page cross, 4 cross and taken
    bmi lbl2 ; 3/4
    bpl lbl2 ; 3/4
    bcc lbl2 ; 3/4
    bcs lbl2 ; 3/4
    beq lbl2 ; 3/4
    bne lbl2 ; 3/4
    bvc lbl2 ; 3/4
    bvs lbl2 ; 3/4

    ; next page
!align 256
lbl2:
    nop
