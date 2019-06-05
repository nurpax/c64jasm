
* = $801

!let irqline0 = 13

!macro foo() {
    lda #0
}

    irqline0 = 33       ; should be allowed
    foo = 21            ; not allowed
