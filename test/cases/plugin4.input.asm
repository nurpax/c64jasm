
* = $801

!use "./plugin-multiple-exports" as math

!let x = math.div2(10)
!let y = math.mul2(10)

    lda #x  ; 5
    lda #y  ; 20
