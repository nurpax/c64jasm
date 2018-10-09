
!use "./plugin-loadbin" as bin

!let foo = bin("filenotfound.txt")

* = $801

    lda #0
