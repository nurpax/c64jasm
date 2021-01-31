
!let border_reg = $d020

!macro set_border(color) {
	lda #color
	sta border_reg
}

	+set_border(13)

	lda #0

	ldx #16
set_foo:
	jsr func
	dex
	bpl set_foo

!for i in range(5) {}

func: {
	rts
}
