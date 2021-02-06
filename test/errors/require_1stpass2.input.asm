
* = $801

!let a = lbl1
!segment code1(start=a, end=$1000)  ; forward refs for start, should propagate through 'a'
!segment code2(start=$801, end=a)   ; ditto but for end

lbl1:
    lda #0
