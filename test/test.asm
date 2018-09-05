
    lda #0         ; foo
loop3:
    sta $d020       ; bar
loop2:sta $d020       ; bar
loop:
    inc $d020       ; bar
    ; bz
    jmp loop
    jmp loop3
