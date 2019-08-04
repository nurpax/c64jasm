
!use "zp_context" as zp

defs: {
    !let defaultZp = {
        tmp0: $20,
        sprite_idx: $22
    }
    ; Zeropage allocation context for macro expansion
    !let zpctx = zp.create(defaultZp)

    ; Macro expansion will look at the 'current' zp allocation
    ; by getting the top of the zp allocation stack.
    !macro test() {
        !let zp = zpctx.top()
        lda #13
        sta zp.tmp0
        ldx zp.sprite_idx
    }
}

; This function uses the default ZP allocation
func: {
    +defs::test()
}

; This uses another ZP allocation.  Let's pretend irq_func
; is an IRQ handler and so it shouldn't clobber over any
; ZP slots that the main execution context uses.
irq_func: {
    !let irqZp = {
        tmp0: $40,
        sprite_idx: $42
    }

    ; Set irqZp as the current zeropage allocation.
    !! defs::zpctx.push(irqZp)
    +defs::test()
    !! defs::zpctx.pop()
}

; This should use default ZP slots from defaultZp
another_func: {
    +defs::test()
}
