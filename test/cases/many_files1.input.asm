; disasm: debuginfo

!include "many_files_defs.inc"

!macro basic_start(addr) {
* = $801
    !byte $0c, $08, $00, $00, $9e
    !for d in [10000, 1000, 100, 10, 1] {
        !if (addr >= d) {
            !byte $30 + (addr/d)%10
        }
    }
    !byte 0, 0, 0
}

+basic_start(entry)
entry: {
    jsr a::set_border_func
    jsr b::set_border_func2

inf: jmp inf
}

!include "many_files_a.asm"
!include "many_files_b.asm"

one_more_defs: {
!include "many_files_defs.inc"
}

test: {
    lda defs::border_reg
    lda a::defs::border_reg
    lda b::defs::border_reg
    +defs::set_border(1)
    +one_more_defs::defs::set_border_black()
}
