
* = $801

!use "./plugin-nested-array" as array

!let d = array(0) ; TODO zero is unused, parser barfs on empty arg list
!for v in d.data {
;    !for vv in v {
;        lda #vv
;    }
    lda #v[0]
}

!for v in d.data[0] {
    lda #v
}

lda #d.data[0][0]
lda #d.data[0][1]
lda #d.data[0][2]

