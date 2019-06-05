; C64jasm example program
;
; see https://github.com/nurpax/c64jasm for more

!include "macros.asm"

; Import plugins.  These are just .js files.  The path
; names are relative to the source file that !use's them.
!use "plugins/math" as math
!use "plugins/petscii" as petscii
!use "plugins/spd" as spd
!use "plugins/spd" as sid

; Load a PETSCII file exported into .json by Petmate.
; The petscii loader will RLE compress the screencodes
; and colors to save some RAM.
!let petscii_background = petscii.rlePetsciiJson("assets/petscii.json")
!let pacman_spd = spd("assets/pacman.spd")


!let irq_top_line = 30
!let SIN_LEN = 64

!let debug_build = TRUE

!let zptmp0 = $20

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry:

;    lda #0
;    jsr music.init

    sei
    lda #$35        ; Bank out kernal and basic
    sta $01         ; $e000-$ffff
    jsr set_raster_irq
    cli

    ; Decompress a PETSCII image on the display
    lda #0
    sta $d020
    sta $d021
    lda #<background_petscii_rle
    ldx #>background_petscii_rle
    jsr pet_rle::decode

frame_loop:
    ; wait for vsync (by polling the framecount that's inc'd
    ; by the raster IRQ)
    lda framecount
vsync:
    cmp framecount
    beq vsync

    ; sine animate the sprite
    lda #0
    tay
    sta zptmp0
anim_sprites:
    lda framecount
    clc
    adc zptmp0
    and #SIN_LEN-1
    tax
    lda sintab, x
    clc
    adc #200
    sta sprite_ypos, y
    lda zptmp0
    adc #5
    sta zptmp0
    iny
    cpy #8
    bne anim_sprites

!if (debug_build) {
    inc $d020
}
    jsr set_sprites

!if (debug_build) {
    dec $d020
}

    jmp frame_loop

; Set sprites to hardware
set_sprites: {
    !let xtmp = zptmp0

    lda #0
    sta $d01d       ; no double width
    sta $d017       ; no double height
    lda #%10101010  ; odd sprites are multicolor, even single
    sta $d01c       ; single color sprites

    lda #sprite_data/64
    ldx #sprite_data2/64
    !for i in range(4) {
        sta $07f8+i*2     ; sprite ptr
        stx $07f8+i*2+1   ; sprite ptr
    }

    ; Set the pacman multicolor sprite multicolor bits
    lda #pacman_spd.multicol1
    sta $d025
    lda #pacman_spd.multicol2
    sta $d026

    lda #35
    sta xtmp
    ldx #0
    ldy #0
xloop:
    lda xtmp        ; x coord
    sta $d000, x
    clc
    adc #30
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

irq_top: {
    +irq_start(end)
    inc framecount

;    jsr music.play

    +irq_end(irq_top, irq_top_line)
end:
}

set_raster_irq: {
    +setup_irq(irq_top, irq_top_line)
    rts
}

framecount:     !byte 0
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

sprite_data2:
!byte pacman_spd.data[0]  ; shape: data[num_sprites][64]

!include "pet_rle.asm"
; Expand the RLE compressed PETSCII bytes
background_petscii_rle: !byte petscii_background.interleaved
