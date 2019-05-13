* = $801

; Note: this is sort of an undocumented
; feature.  It'd be better to do like KickAssembler
; which supports for lbls like:
;
; forlbl[0].lbl
;
; The mechanism here is the same, just that [] is not supported
; when resolving scopes.  Might add this later.

forlbl: !for i in range(3) {
foo: lda #0
    sta $d020
}

    lda #13
    sta forlbl__0::foo-1
    sta forlbl__1::foo-1
    sta forlbl__2::foo-1
