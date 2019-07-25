
* = $801

!let obj = { "foo": 1 }
!let obj2 = { 0: 2 }

    lda #obj.foo    ; 1
    lda #obj2[0]    ; 2
