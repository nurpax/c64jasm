
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
    lda #((1<<4) - 1)
foo:
    !byte 0
    !word 0
