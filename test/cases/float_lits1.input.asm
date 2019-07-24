* = $801

!let zero_point_1 = 0.125
!let pi = 3.14159265359
!let two = 2
!let thousand = 1e3
!let oothousand = 1e-3

    lda #zero_point_1*8    ; 1
    ldx #pi                ; 3
    ldx #pi * 2            ; 6
    ldx #two*0.5           ; 1
    ldx #thousand*0.1      ; 100
    ldx #oothousand*10000  ; 10

    ldx #1e-3 - 1e-3       ; 0