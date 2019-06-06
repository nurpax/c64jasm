; C64jasm example program
;
; see https://github.com/nurpax/c64jasm for more

!include "macros.asm"

; Import plugins.  These are just .js files.  The path
; names are relative to the source file that !use's them.
!use "plugins/math" as math
!use "plugins/petscii" as petscii
!use "plugins/spd" as spd
!use "plugins/sid" as sid

; Load a PETSCII file exported into .json by Petmate.
; The petscii loader will RLE compress the screencodes
; and colors to save some RAM.
!let petscii_background = petscii.rlePetsciiJson("assets/pipes-pet.json")
!let pacman_spd = spd("assets/pacman.spd")
!let music = sid("assets/Load_Line.sid")

!let irq_top_line = 10
!let SIN_LEN = 64
!let SINX_LEN = 256

!let debug_build = FALSE

!let zptmp0 = $20

+basic_start(entry)
;--------------------------------------------------------------
; Execution starts here
;--------------------------------------------------------------
entry: {
    lda #0
    jsr music.init

    sei
    lda #$35        ; Bank out kernal and basic
    sta $01         ; $e000-$ffff
    +setup_irq(irq_top, irq_top_line)
    cli

    ; Decompress a PETSCII image on the display
    lda #0
    sta $d020
    sta $d021
    lda #<background_petscii_rle
    ldx #>background_petscii_rle
    jsr pet_rle::decode

frame_loop:
    ; wait for vsync by polling the framecount that's inc'd
    ; by the raster IRQ
    lda framecount
vsync:
    cmp framecount
    beq vsync

!if (debug_build) {
    inc $d020
}
    jsr text_color_cycle
    jsr animate_sprites
    jsr set_sprite_regs

!if (debug_build) {
    dec $d020
}
    jmp frame_loop
}

animate_sprites: {
    !let xanimptr = zptmp0 + 2
    !let sidx = zptmp0 + 4
    ; sine animate sprites (y-coord)
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
    adc #142
    sta sprite_ypos, y
    lda zptmp0
    clc
    adc #5          ; no clc needed
    sta zptmp0
    iny
    cpy #8
    bne anim_sprites

    ; animate sprites (x-coord)
    ; just ping-pong motion which turned out
    ; to be a lot of code and RAM.. patches are welcome ;)
    lda #0
    sta sidx
    sta zptmp0
anim_sprites_x:
    lda framecount
    clc
    adc zptmp0

    ; xanimptr = (framecount+zptmp0)<<1
    sta xanimptr
    lda #0
    sta xanimptr+1
    lda xanimptr
    asl
    sta xanimptr+0
    rol xanimptr+1

    ; xanimptr += xanim_tbl
    clc
    adc #<xanim_tbl
    sta xanimptr+0
    lda xanimptr+1
    adc #>xanim_tbl
    sta xanimptr+1

    ldy #0
    ldx sidx
    lda (xanimptr), y
    sta sprite_xpos+0, x
    iny
    lda (xanimptr), y
    sta sprite_xpos+1, x

    lda zptmp0
    clc
    adc #15
    sta zptmp0

    txa
    clc
    adc #2
    sta sidx
    cmp #8*2
    bne anim_sprites_x
    rts
}

; Set sprites to hardware
set_sprite_regs: {
    !let xcoord = zptmp0
    !let x9bit = zptmp0 + 2
    !let sidx = zptmp0 + 4

    lda #0
    sta $d01d       ; no double width
    sta $d017       ; no double height
    lda #%11111111  ; all 8 sprites multicolor
    sta $d01c       ; single color sprites

    lda #sprite_data/64
    ldx #sprite_data2/64
    !for i in range(4) {
        stx $07f8+i*2     ; sprite ptr
        sta $07f8+i*2+1   ; sprite ptr
    }

    ; Set the pacman multicolor sprite multicolor bits
    lda #pacman_spd.multicol1
    sta $d025
    lda #pacman_spd.multicol2
    sta $d026

    lda #0
    sta sidx
    sta x9bit
xloop:
    lda sidx
    asl
    tax
    lda sprite_xpos + 0, x
    sta xcoord
    lda sprite_xpos + 1, x
    sta xcoord+1

    lda xcoord        ; x coord
    sta $d000, x

    ldy sidx
    lda sprite_ypos, y
    sta $d001, x

    lda sprite_color, y
    sta $d027, y

    ; work out 9th bit of sprite x-coord
    lda xcoord+1
    and #1
    beq lt256
    ldx sidx
    lda x9bit
    ora shift_lut, x
    sta x9bit
lt256:

    inc sidx
    cpy #7
    bne xloop

    ; Enable all sprites
    lda #%11111111
    sta $d015
    lda x9bit
    sta $d010
    rts

shift_lut:
!for i in range(8) {
    !byte 1<<i
}
}

text_color_cycle: {
    !let zx1 = zptmp0
    !let zx2 = zptmp0+1

    lda framecount
    lsr
    lsr
    sta zx1

    ; rotate the bottom row in reverse direction
    lda #0
    sec
    sbc zx1
    sta zx2

    ldx #0
cycle:
    lda zx1
    and #7
    tay
    lda colors1, y
    sta $d800+40, x

    lda zx2
    and #7
    tay
    lda colors2, y
    sta $d800+23*40, x

    inc zx1
    inc zx2
    inx
    cpx #40
    bne cycle

    rts
colors1: !byte 11, 12, 15, 1, 1, 15, 12, 11
colors2: !byte 6, 14, 3, 1, 1, 3, 14, 6
}

irq_top: {
    +irq_start(end)
    inc framecount

    jsr music.play

    +irq_end(irq_top, irq_top_line)
end:
}

framecount:     !byte 0
sprite_xpos:    !fill 8*2, 0    ; word
sprite_ypos:    !fill 8, 0      ; byte
sprite_color:   !byte 3, 10, 3, 9, 3, 2, 3, 14

!let sinvals = math.sintab(SIN_LEN, 30)
sintab:
!for v in sinvals {
    !byte v
}

xanim_tbl:
!for v in range(128) { !word (v*2-128) + 344/2 }
!for v in range(128) { !word 344/2 - (v*2-128) }

* = music.startAddress  ; most sids will go to $1000
sid_data: !byte music.data

* = $2000
sprite_data:
!byte pacman_spd.data[0]   ; shape: data[num_sprites][64]
sprite_data2:
!byte pacman_spd.data[1]   ; shape: data[num_sprites][64]

!include "pet_rle.asm"
; Expand the RLE compressed PETSCII bytes
background_petscii_rle: !byte petscii_background.interleaved
