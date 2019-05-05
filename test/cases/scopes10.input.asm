* = $801

part1: {
    !let num_sprites = 13
    lda #num_sprites
    rts
}

main: {
    lda #::part1::num_sprites + 1
}
