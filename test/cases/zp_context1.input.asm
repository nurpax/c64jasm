
!use "zp_context" as zp

defs: {
    !let defaultZp = {
        tmp0: $20,
        sprite_idx: $22
    }
    ; Zeropage allocation context for macro expansion
    !let zpctx = zp.create(defaultZp)

    ; Make another stack and push some values into it
    ; to test that pushing onto another stack won't
    ; affect 'zpctx'.
    !let zpctx2 = zp.create({ foo: 1})
    !let dummy1 = zpctx2.push({ foo: 2})
    !let dummy2 = zpctx2.push({ foo: 3})
    !let dummy3 = zpctx2.pop()

    ; Macro expansion will look at the 'current' zp allocation
    ; by getting the top of the zp allocation stack.
    !macro test() {
        !let zp = zpctx.top()
        lda #13
        sta zp.tmp0
        ldx zp.sprite_idx
    }
}

; Could access defs::zpctx below too, just trying out that
; this also works.
!let zpctx = defs::zpctx

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
    ;
    ; Alas, C64jasm doesn't (currently at least) support running statements..
    ; So abusing !let to run zpctx.push() statement.
    !let dummy = zpctx.push(irqZp)
    +defs::test()
    !let dummy2 = zpctx.pop()
}

; This should use default ZP slots from defaultZp
another_func: {
    +defs::test()
}
