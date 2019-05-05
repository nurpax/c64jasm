; nested scopes


* = $801

foo: {
scope1: {
    jmp _local_label
_local_label:
}
_baz: {
    lda #0
    bne _local_label
_local_label: ; this should be ok
    jmp _local_label
}
    rts
}

    jsr foo
