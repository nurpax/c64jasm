
    lda #0
!let a = 13
!let b = x

!include b   ; this error should be suppressed here as 'b' is in error
    lda #1
