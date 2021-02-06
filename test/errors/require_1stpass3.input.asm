
* = $801

!let a = $900
!let b = a + 4

!segment code(start=a, end=b) ; should be ok

!! b = b + 1

!segment code2(start=a+100, end=100+b) ; should still be ok

!let foo = lbl
!! b = b + foo

!segment code3(start=a+200, end=200+b) ; fail, first pass error propagates through foo

    * = $2000
lbl: