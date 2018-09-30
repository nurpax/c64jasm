
* = $801

!let irqline0 = 13
!let irqline1 = 52 + irqline0

    lda #irqline0 + 1
    lda #irqline1 + 2
