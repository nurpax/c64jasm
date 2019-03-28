
* = $801
    !let foo = 1
    !let bar = 0
    !if (foo || bar) {
        lda #1
    }
    !if (foo && bar) {
        lda #0  ; shouldn't happen
    } else {
        lda #2
    }
    bar = foo && 1
    !if (bar) {
        lda #3
    }
    bar = 1 && 0
    !if (bar) {
        lda #0
    } else {
        lda #4
    }
    bar = 0 || 1
    !if (bar) {
        lda #5
    }
