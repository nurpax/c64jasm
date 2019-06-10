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
    clc
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

    lda #sprite_data/64
    !for i in range(8) {
        sta $07f8+i     ; sprite ptr
    }

    lda #30
    sta xtmp
    ldx #0
    ldy #0
xloop:
    lda xtmp        ; x coord
    sta $d000, x
    clc
    adc #28
    sta xtmp

    lda sprite_color, y
    sta $d027, y

    lda sprite_ypos, y
    sta $d001, x
    iny
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
sprite_color:   !byte 1, 7, 8, 9, 10, 2, 13, 14

!let sinvals = math.sintab(SIN_LEN, 30)
sintab:
!for v in sinvals {
    !byte v
}

!align 64
sprite_data:
!for y in range(21) {
    !for x in range(3) {
        !let bits = 0
        !for xi in range(8) {
            !let xx = x*8 + xi
            !let ox = xx - 24/2
            !let oy = y - 21/2
            !let r = ox*ox + oy*oy
            !let v = 0
            !if (r < 10*10) {
                v = 1
            }
            !if (r < 5*5) {
                v = 0
            }
            bits = bits | (v << (7-xi))
        }
        !byte bits
    }
}
!byte 0  ; pad to 64 bytes
