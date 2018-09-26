
* = $801

!use "./loadbin" as loadBinary

    lda #0
!for v in loadBinary("./binary1.bin") {
    lda v
}
    lda #1
