
* = $801

!let empty_obj = { }
!let empty_obj2 = {

}

!let obj = { foo: 1 }
!let obj2 = {
    bar: 1+1
}
!let obj3 = {
    o: { a: 3 },
    y: {
        a: 4
    }
}
!let x = { f: obj3 }

    lda #obj.foo    ; 1
    lda #obj2.bar   ; 2
    lda #obj3.o.a   ; 3
    lda #obj3.y.a   ; 4
    lda #x.f.y.a+1  ; 5
