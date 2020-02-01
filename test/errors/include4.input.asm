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

; regression test case.  somehow including "include4_scope.asm" (which)
; doesn't contain errors) will mask out the error w.r.t inexistent_file.asm.
; if both are missing, two errors get correctly printed.
!include "include4_scope.asm"
!include "inexistent_file.asm"  ; this should be an error
