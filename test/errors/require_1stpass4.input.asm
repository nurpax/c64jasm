
* = $801

!let obj1 = { s: $801 }
!segment code1(start=obj1.s, end=$820)  ; this should work
!let obj2 = { s: lbl1 }
!segment code2(start=$1000, end=obj2.s) ; forward refs not accepted for segments, even if they come through objects

lbl1:
    lda #0
