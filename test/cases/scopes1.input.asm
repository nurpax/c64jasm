
* = $801

foo: {
    jmp .local_label
.local_label:
    rts
}

foo2: {
    jmp .local_label
.local_label:
    rts
}

    jsr foo
    jsr foo2
    lda #0
