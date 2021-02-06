
!let a = lbl ; resolves to value in 2nd pass
* = $801

    lda #0
    nop
    nop
    nop
    nop

* = a ; only first pass resolvable expressions are allowed

lbl:
