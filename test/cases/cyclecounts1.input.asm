; disasm: cycles

    adc #0
    adc $20
    adc $20,x
    adc $2000
    adc $2000,x
    adc $2000,y
    adc ($44,x)
    adc ($44),y

    nop

    and #0
    and $20
    and $20,x
    and $2000
    and $2000,x
    and $2000,y
    and ($44,x)
    and ($44),y

    nop

    asl
    asl $20
    asl $20,x
    asl $2000
    asl $2000,x

    nop

    bit $20
    bit $2000

    bmi lbl1
    bpl lbl1
    bcc lbl1
    bcs lbl1
    beq lbl1
    bne lbl1
    bvc lbl1
    bvs lbl1
lbl1:

    brk

    clc
    cld
    cli
    clv
    sei
    sec
    sed


    cmp #$44      ; $C9  2   2
    cmp $44       ; $C5  2   3
    cmp $44,x     ; $D5  2   4
    cmp $4400     ; $CD  3   4
    cmp $4400,x   ; $DD  3   4+
    cmp $4400,y   ; $D9  3   4+
    cmp ($44,x)   ; $C1  2   6
    cmp ($44),y   ; $D1  2   5+

    nop

    cpx #$44      ; $E0  2   2
    cpx $44       ; $E4  2   3
    cpx $4400     ; $EC  3   4

    cpy #$44      ; $C0  2   2
    cpy $44       ; $C4  2   3
    cpy $4400     ; $CC  3   4

    nop

    dec $44       ; $C6  2   5
    dec $44,x     ; $D6  2   6
    dec $4400     ; $CE  3   6
    dec $4400,x   ; $DE  3   7

    nop

    dex           ; 2
    dey           ; 2
    inx           ; 2
    iny           ; 2
    tax           ; 2
    txa           ; 2
    tay           ; 2
    tya           ; 2

    nop

    jmp $2000
    jmp ($2000)

    nop

    eor #$44      ; $49  2   2
    eor $44       ; $45  2   3
    eor $44,x     ; $55  2   4
    eor $4400     ; $4D  3   4
    eor $4400,x   ; $5D  3   4+
    eor $4400,y   ; $59  3   4+
    eor ($44,x)   ; $41  2   6
    eor ($44),y   ; $51  2   5+

    nop
    inc $44       ; $E6  2   5
    inc $44,x     ; $F6  2   6
    inc $4400     ; $EE  3   6
    inc $4400,x   ; $FE  3   7

    jsr $2000

    nop

    lda #$44      ; $A9  2   2
    lda $44       ; $A5  2   3
    lda $44,x     ; $B5  2   4
    lda $4400     ; $AD  3   4
    lda $4400,x   ; $BD  3   4+
    lda $4400,y   ; $B9  3   4+
    lda ($44,x)   ; $A1  2   6
    lda ($44),y   ; $B1  2   5+

    nop
    ldx #$44      ; $A2  2   2
    ldx $44       ; $A6  2   3
    ldx $44,y     ; $B6  2   4
    ldx $4400     ; $AE  3   4
    ldx $4400,y   ; $BE  3   4+

    nop
    ldy #$44      ; $A0  2   2
    ldy $44       ; $A4  2   3
    ldy $44,x     ; $B4  2   4
    ldy $4400     ; $AC  3   4
    ldy $4400,x   ; $BC  3   4+

    nop
    lsr           ; $4A  1   2
    lsr $44       ; $46  2   5
    lsr $44,x     ; $56  2   6
    lsr $4400     ; $4E  3   6
    lsr $4400,x   ; $5E  3   7

    nop
    ora #$44      ; $49  2   2
    ora $44       ; $45  2   3
    ora $44,x     ; $55  2   4
    ora $4400     ; $4D  3   4
    ora $4400,x   ; $5D  3   4+
    ora $4400,y   ; $59  3   4+
    ora ($44,x)   ; $41  2   6
    ora ($44),y   ; $51  2   5+

    nop

    sbc #$44      ; $E9  2   2
    sbc $44       ; $E5  2   3
    sbc $44,x     ; $F5  2   4
    sbc $4400     ; $ED  3   4
    sbc $4400,x   ; $FD  3   4+
    sbc $4400,y   ; $F9  3   4+
    sbc ($44,x)   ; $E1  2   6
    sbc ($44),y   ; $F1  2   5+

    nop
    rol           ; $2A  1   2
    rol $44       ; $26  2   5
    rol $44,x     ; $36  2   6
    rol $4400     ; $2E  3   6
    rol $4400,x   ; $3E  3   7

    nop
    ror           ; $6A  1   2
    ror $44       ; $66  2   5
    ror $44,x     ; $76  2   6
    ror $4400     ; $6E  3   6
    ror $4400,x   ; $7E  3   7

    nop
    txs           ; $9A  2
    tsx           ; $BA  2
    pha           ; $48  3
    pla           ; $68  4
    php           ; $08  3
    plp           ; $28  4

;   sta, stx, sty
    nop
    stx $44       ; $86  2   3
    stx $44,y     ; $96  2   4
    stx $4400     ; $8E  3   4
    sty $44       ; $84  2   3
    sty $44,x     ; $94  2   4
    sty $4400     ; $8C  3   4

    nop
    sta $44       ; $85  2   3
    sta $44,x     ; $95  2   4
    sta $4400     ; $8D  3   4
    sta $4400,x   ; $9D  3   5
    sta $4400,y   ; $99  3   5
    sta ($44,x)   ; $81  2   6
    sta ($44),y   ; $91  2   6

    nop
    tax
    txa
    tay
    tya

    nop
    rti           ; 6
    rts           ; 6