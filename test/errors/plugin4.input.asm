* = $801

!use "./plugin-multiple-exports" as math

    lda #math.div(3, 0) ; should report an error as the plugin throws
