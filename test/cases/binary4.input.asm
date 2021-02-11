; disasm: debuginfo

* = $801

    lda #0
lbl1:
; these should output the following byte sequence:
; 00 01 02 03
; 02 03
; 00 01 02 03
; 02 03
!binary (file="binary1.bin", offset=0)
!binary (file="binary1.bin", offset=2, size=2)
!binary (file="binary1.bin", size=4)
!binary (file="binary1.bin", offset=2)
    lda #2
