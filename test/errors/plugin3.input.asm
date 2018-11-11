
!use "./plugin-multiple-exports" as plugin

!let a = plugin.div2(10)             ; this should work
!let b = plugin.no_such_function(10) ; this fail

* = $801

    lda #0
