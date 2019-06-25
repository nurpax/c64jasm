* = $801

!let a = 0
!let b = 0

!let c = xx  ; should show error
!let d = yy  ; should also show error on this line

    ; error cascade prevention
    ; there should be no error here as 'c' and 'd' should've been tagged
    ; poisonous yet 'c' and 'd' should be declared
    lda #c + d
