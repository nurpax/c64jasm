
* = $801

!let foo = "foo"
!let bar = "bar"

!if (foo + bar == "foobar") {
    lda #1
} else {
    lda #0
}

!if (foo >= bar) {
    lda #2
} else {
    lda #0
}
