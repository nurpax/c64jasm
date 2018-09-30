
* = $801

!let xScale = 2
!let yScale = 2

!macro nested(i, x, y) {
    !macro setpos(i, x, y) {
        ldx #100 + x * xScale * 24
        stx $d000 + i*2
        ldy #92 + y*21 * yScale
        sty $d000 + i*2 + 1
    }
    +setpos(i, x, y)
}

ldx #100    ; load x,y position
!for si in range(0, 4) {
    +nested(si, si & 1,si >> 1)
}
