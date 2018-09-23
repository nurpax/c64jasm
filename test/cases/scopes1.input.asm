
* = $801

foo: {
    jmp _local_label
_local_label:
    rts
}

foo2: {
    jmp _local_label
_local_label:
    rts
}

    jsr foo
    jsr foo2
    lda #0
