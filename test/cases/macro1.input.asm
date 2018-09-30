* = $801

!macro foo(a, b) {
    lda #a
    lda #b
}

!macro add16imm(a, imm) {
    lda a
    clc
    adc #<imm
    sta a
    lda a+1
    adc #>imm
    sta a+1
}

    +foo(1, 2)
    +foo(7, 1<<3)

    +add16imm(cnt, 3)

cnt: !word 0