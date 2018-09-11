* = $801

start: 
    jmp real_start

    bne loop

real_start:
    lda #1            

    lda #0
    sta $d020
    lda #0
    sta $d021

    ldx #$00
loop:
    lda screen_002+2+0*$100,x
    sta $0400+0*$100,x
    lda screen_002+2+25*40+0*$100,x
    sta $d800+0*$100,x

    lda screen_002+2+1*$100,x
    sta $0400+1*$100,x
    lda screen_002+2+25*40+1*$100,x
    sta $d800 + 1 * $100 , x

screen_002:
!byte 0, 0
!byte $ea, $ea,$ea ,$ea
!byte $ea
