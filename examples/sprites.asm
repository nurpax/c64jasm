; C64jasm example program
;
; see https://github.com/nurpax/c64jasm for more

!use "math" as math   ; See math.js in the same dir as this .asm file

!let SIN_LEN = 64

!let zptmp0 = $20

; Note: macros would probably go into a separate
; macros.asm that you'd !include here.  But
; I want to keep these examples self-contained
; in a single file.
!macro basic_start(addr) {
* = $801
    !byte $0c
    !byte $08
    !byte $00
    !byte $00
    !byte $9e

!if (addr >= 10000) {
    !byte $30 + (addr/10000)%10
}
!if (addr >= 1000) {
    !byte $30 + (addr/1000)%10
}
!if (addr >= 100) {
    !byte $30 + (addr/100)%10
}
!if (addr >= 10) {
    !byte $30 + (addr/10)%10
}
    !byte $30 + addr % 10
    !byte 0, 0, 0
}

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry:

frame_loop:
    jsr wait_first_line

    ; sine animate the sprite
    lda #0
    tay
    sta zptmp0
anim_sprites:
    lda animcnt
    clc
    adc zptmp0
    and #SIN_LEN-1
    tax
    lda sintab, x
    clc
    adc #100
    sta sprite_ypos, y
    lda zptmp0
    adc #5
    sta zptmp0
    iny
    cpy #8
    bne anim_sprites
    inc animcnt

    jsr set_sprites

    jmp frame_loop

set_sprites: {
    !let xtmp = zptmp0

    lda #0
    sta $d01d       ; no double width
    sta $d017       ; no double height
    sta $d01c       ; single color sprites

    lda #1
    !for i in range(8) {
        sta $d027+i     ; white sprites 0-8
    }

    lda #30
    sta xtmp
    ldx #0
xloop:
    lda xtmp        ; x coord
    sta $d000, x
    clc
    adc #28
    sta xtmp

    txa
    lsr
    tay
    lda sprite_ypos, y
    sta $d001, x
    inx
    inx
    cpx #16
    bne xloop

    ; Enable all sprites
    lda #%11111111
    sta $d015
    rts
}

wait_first_line: {
    ldx $d012
    lda $d011
    and #$80
    bne wait_first_line
    cpx #0
    bne wait_first_line
    rts
}

animcnt:        !byte 0
sprite_ypos:    !fill 8, 0

!let sinvals = math.sintab(SIN_LEN, 30)
sintab:
!for v in sinvals {
    !byte v
}
