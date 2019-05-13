
* = $801

!use "plugin-multiple-exports" as m

!for s in m.nestedArray() {
    ; Iterate list elems directly
    !for e in s {
        lda #e.x
        lda #e.y
    }
    nop
    ; Iterate index and access elems by index
    !for i in range(2) {
        lda #s[i].x & 255
        lda #s[i].y & 255
    }
    nop
}
