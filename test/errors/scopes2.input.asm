
* = $801

foo: {
    jmp .local_label
.local_label:
.local_label: ; duplicate
    rts
}
