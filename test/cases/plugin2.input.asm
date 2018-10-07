
* = $801

!use "./plugin-sintab" as mkSintab

    lda #0
!for v in mkSintab(16, 8) {
    lda #(v & 255)
}
