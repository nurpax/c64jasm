!filescope pet_rle

; Name some zero page addresses for use in the below decoder
!let z_src = $20
!let z_y = $22
!let z_scr_dst = $24
!let z_len = $26

!let z_scrdst = $28
!let z_coldst = $2a

; A = lo src
; X = hi src
decode: {
    sta z_src
    stx z_src+1

    lda #25
    sta z_y

    lda #0
    sta z_scrdst
    sta z_coldst
    lda #>$0400
    sta z_scrdst+1
    lda #>$d800
    sta z_coldst+1

yloop:
    ldy #0           ; RLE source index within line

    lda z_scrdst
    sta decode_line::dst-2
    lda z_scrdst+1
    sta decode_line::dst-1
    jsr decode_line

    lda z_coldst
    sta decode_line::dst-2
    lda z_coldst+1
    sta decode_line::dst-1
    jsr decode_line

    tya
    clc
    adc z_src
    sta z_src
    lda z_src+1
    adc #0
    sta z_src+1

    ; advance screen dest ptr
    lda z_scrdst  ; no CLC needed
    adc #40
    sta z_scrdst
    lda z_scrdst+1
    adc #0
    sta z_scrdst+1

    lda z_coldst  ; no CLC needed
    adc #40
    sta z_coldst
    lda z_coldst+1
    adc #0
    sta z_coldst+1

    dec z_y
    bne yloop
    rts

decode_line: {
    ldx #0           ; dest index
xloop:
    lda (z_src), y   ; run-length
    sta z_len
    iny
    lda (z_src), y   ; screen code
    iny

blit:
    sta $1234, x     ; $0400 screen
dst:
    inx
    dec z_len
    bne blit

    cpx #40
    bne xloop
    rts
}
}
