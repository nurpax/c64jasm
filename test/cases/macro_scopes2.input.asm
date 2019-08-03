* = $801

!for i in range(4) {
    !macro foo() {
        lda #i
    }
    +foo() ; -> LDA #0, LDA #1, LDA 2, LDA 3
}
