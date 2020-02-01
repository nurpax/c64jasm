* = $801

!let zptmp4 = $22
!let zptmp8 = $28

; move two bytes from n1 to res
!macro mov16(res, n1) {
    lda n1
    sta res+0
    lda n1+1
    sta res+1
}

; add 16 bit immediate to a 16bit value
!macro add16_imm16(res, lo, hi) {
    clc
    lda res
    adc #lo
    sta res+0
    lda res+1
    adc #hi
    sta res+1
}

!include "for2_scope.asm"
!include "for2_scope_2.asm"
