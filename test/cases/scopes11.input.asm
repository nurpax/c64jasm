* = $801

part1: {
    !let num_sprites = 13
    lda #num_sprites
    rts
}

!macro x() {
    lda #part1::num_sprites + 1
    !for i in range(3) {
        lda #part1::num_sprites + 2
        lda #::part1::num_sprites + 2 + i
    }
}

+x()
