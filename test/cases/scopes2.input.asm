; nested scopes


* = $801

foo: {
    jmp _local_label
_local_label:
_baz: {
    lda #0
    bne _local_label
_local_label: ; this should be ok
}
    bne _local_label ; should jump to first .local_label
    rts
}

    jsr foo
