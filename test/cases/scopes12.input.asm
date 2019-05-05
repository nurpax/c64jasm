* = $801

part1: {
    !let num_sprites = 13
    lda #num_sprites
inner: {
    !let foo = 252
    lda part1
    jmp inner
    rts
}
    jsr inner
    jsr part1::inner
    jmp part1
    rts
}

!macro x() {
    lda #part1::num_sprites + 1
}

+x()

main: {
    lda #part1::num_sprites + 2     ; relative access to variable
    lda part1::inner                ; relative paths

    lda #part1::inner::foo          ; relative access to var nested in two named scopes
    lda #::part1::inner::foo        ; absolute access to var nested in two named scopes
}

    lda #::part1::inner::foo        ; absolute access to var nested in two named scopes
    lda #part1::inner::foo+1        ; absolute access to var nested in two named scopes
