* = $801

!macro smc() {
    lda #0
smcptr:
}

lbl1: +smc()
lbl2: +smc()

    sta lbl1::smcptr-1
    sta lbl2::smcptr-1
