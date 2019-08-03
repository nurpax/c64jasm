!filescope defs

!let border_reg = $d020

!macro set_border(color) {
    lda #color
    sta border_reg
}

!macro set_border_black() {
    +set_border(0)
}
