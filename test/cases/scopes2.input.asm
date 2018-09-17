; nested scopes


* = $801

foo: {
    jmp .local_label
.local_label:
.baz: {
    lda #0
    bne .local_label
.local_label: ; this should be ok
}
    bne .local_label ; should jump to first .local_label
    rts
}

    jsr foo
