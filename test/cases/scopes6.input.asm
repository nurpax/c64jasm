
* = $801

!let xScale = 2
!let yScale = 2

!macro setpos(i, x, y) {
    !let spritereg = $d000 + i*2
    ldx #100 + x * xScale * 24
    stx spritereg
    spritereg = spritereg + 1
    ldy #92 + y*21 * yScale
    sty spritereg
}

ldx #100    ; load x,y position
!let xx = 0
!for si in range(4) {
    +setpos(xx, si & 1,si >> 1)
    xx = xx + 1
}
