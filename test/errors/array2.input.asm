
* = $801

!let arr = [0, 1, 2]
!let idx = "x"       ; should trigger error
    lda #arr["foo"]  ; cannot index by string
    lda #arr[idx]    ; cannot index by string
    lda #arrx[0]     ; arrx undeclared

!let i = xx          ; error here
    lda #arr[i]     ; no errors here (would be cascaded error)
