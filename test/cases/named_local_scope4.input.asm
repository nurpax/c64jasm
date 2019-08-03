* = $801

scope: {
    !macro smc() {
        lda #0
    smcptr:
    }
}

lbl1: +scope::smc()
lbl2: +scope::smc()

    sta lbl1::smcptr-1
    sta lbl2::smcptr-1
