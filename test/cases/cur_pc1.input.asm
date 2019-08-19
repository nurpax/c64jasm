
* = $801

    jmp *  ; inf loop

    jmp *+3
foo:nop
    ; should end up here
    jmp *-1 ; should jmp to foo

!let lbl = * + 3
    jmp lbl ; should jmp to nop
baz:
    nop

    bcc *+3 ; jump over first nop
    nop
    nop