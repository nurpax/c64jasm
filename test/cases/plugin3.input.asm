
* = $801

!use "./plugin-nested-array" as array

!let d = array() ; TODO zero is unused, parser barfs on empty arg list
!for v in d.data {
    !for vv in v {
        lda #vv
    }
}

!for v in d.data[0] { ; 0,1,2
    lda #v
}

lda #d.data[1][0]     ; 3,4,5
lda #d.data[1][1]
lda #d.data[1][2]

