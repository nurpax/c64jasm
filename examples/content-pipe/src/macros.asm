
!let FALSE = 0
!let TRUE = 1

; Basic starter macro that needs to be the first emitted
; code in your main assembly source file.
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

;------------------------------------------------------------------------
; IRQ setup macros

!macro setup_irq(irq_addr, irq_line) {
    lda #$7f
    sta $dc0d
    sta $dd0d

    lda #<irq_addr
    ldx #>irq_addr
    sta $fffe
    stx $ffff

    lda #$01
    sta $d01a
    lda #irq_line
    sta $d012
    !if (irq_line > 255) {
        !error "this macro doesn't support setting the 9th bit of irq line"
    }
    lda $d011
    and #$7f
    sta $d011

    asl $d019
    bit $dc0d
    bit $dd0d
}

!macro end_irq(next_irq_addr, next_irq_line, irq_line_hi) {
    asl $d019
    lda #<next_irq_addr
    sta $fffe
    lda #>next_irq_addr
    sta $ffff
    lda #next_irq_line
    sta $d012
    !if (irq_line_hi) {
        lda $d011
        ora #$80
        sta $d011
    } else {
        lda $d011
        and #$7f
        sta $d011
    }
}

!macro irq_start(end_lbl) {
    sta end_lbl-6
    stx end_lbl-4
    sty end_lbl-2
}

!macro irq_end(next, line) {
    +end_irq(next, line, FALSE)
    lda #$00
    ldx #$00
    ldy #$00
    rti
}
