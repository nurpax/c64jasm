* = $801

!use "./plugin-exception" as plug

    lda #plug()  ; should report an error as the plugin throws
