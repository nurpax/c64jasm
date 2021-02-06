
!let a = $400

* = a
    lda #0  ; should start at $400 and not some older C64 specific $801 default
* = a+8
    lda #1
