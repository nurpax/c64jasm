
* = $801

!for i in loadJson("test2.json") {
!for j in i {
    lda #j
}
}
