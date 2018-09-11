* = $801

    lda #1<<0
    lda #1<<1
    lda #1<<2
    lda #1<<3
    lda #1<<4
    lda #1<<5
    lda #1<<6
    lda #1<<7

    lda #$80 >> 0
    lda #$80 >> 1
    lda #$80 >> 2
    lda #$80 >> 3
    lda #$80 >> 4
    lda #$80 >> 5
    lda #$80 >> 6
    lda #$80 >> 7

    lda #255 & 1
    lda #255 & 2
    lda #255 & 3
    lda #255 & 4
    lda #255 & 7
    lda #255 & 15

    lda #1^1
    lda #255^127
    
    lda #255 ^ 127 >> 1
    lda #255 ^ (127 >> 1)
