* = $801

!binary 13, 0,0             ; wrong filename type (should be string)
!binary "foo.bin", "0", 0   ; size should be number
!binary "foo.bin", 0, "0"   ; offset should be number

    lda #0