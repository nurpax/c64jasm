* = $801

!macro speedcode() {
    !let addr = 0
    !macro foo() {
        lda #0
    lbl:
    addr = lbl-1
    }
    +foo()
    sta addr
    +foo()
    sta addr
}

foo: {
!let addr = 13
    +speedcode()
    +speedcode()
}