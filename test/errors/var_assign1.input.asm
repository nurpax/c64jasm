
* = $801

func: {
!let aa = 3
}
!let var1 = 2
::var1 = 3  ; only relative and single-length scope paths are allowed
::func::aa = 4

    lda #var1
