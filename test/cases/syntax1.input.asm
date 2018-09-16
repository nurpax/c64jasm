
* = $801

    lda #0      ; this is a comment
    ldx #1;also a comment
    ; lda #0
;lda00

!if (0) {  ;; foo

} else {
;    lda #0
}

!macro foo(a) { ;; foo 
; comments
}

+foo(0)