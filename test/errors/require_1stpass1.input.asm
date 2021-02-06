
* = $801

!segment code1(start=lbl1, end=1000)  ; forward refs not accepted for segments
!segment code2(start=$1000, end=lbl1) ; forward refs not accepted for segments

lbl1:
    lda #0
