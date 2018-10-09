
* = $801
!for i in range(4) {
    !if (i == 0) {
        lda #0
    } elif (i == 1) {
        lda #1
    } elif (i == 2) {
        lda #2
    } else {
        lda #3
    }
}
