
* = $801

!let xScale = 2
!let yScale = 2

ldx #100
!for i in range(0, 4) {
    !let x = i & 1
    !let y = i >> 1
    ldx #100 + x * xScale * 24
    stx $d000 + i*2
    ldy #92 + y*21 * yScale
    sty $d000 + i*2 + 1
}
