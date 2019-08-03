* = $801

; See https://github.com/nurpax/c64jasm/issues/56

scope: {
	!macro m1() {
		lda #1
	}

	!macro m2() {
		lda #2
		+scope::m1()
		+m1() ; <--- this shouldn't fail but fails now
	}
}

+scope::m2()
