!filescope bintris2

my_func: {
!let NUM_TARGETS = 16
    lda #0
!for i in range(NUM_TARGETS) {
    bne no_match    
    nop
    nop
    nop
    nop
no_match:
}
}

baz: {
!for i in range(1) { 
    nop 
}
    jmp foox

	!let lst = [ba, bb, bc]
	!let wmask = [bam, bbm, bcm]
	!for ss in range(3) {
		!let lo = lst[ss]
		!let hi = lst[ss]>>8
		+mov16(zptmp8, zptmp4)
		+add16_imm16(zptmp8, lo, hi)
    }
foox:
    rts
}

ba: !byte 0
bb: !byte 0
bc: !byte 0

bam: !byte 0
bbm: !byte 0
bcm: !byte 0
