!macro basic_start() {
* = $801
    !byte $0c
    !byte $08
    !byte $00
    !byte $00
    !byte $9e
!let addr = $080d
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

+basic_start()

    lda #0
    sta $d020
loop:
    jmp loop
