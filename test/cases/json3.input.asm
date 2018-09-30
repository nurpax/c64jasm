
* = $801

; {
;     "screens": ["a", "b"],
;     "a": {
;         "bytes": [0,1,2,3,4]
;     },
;     "b": {
;         "bytes": [5,6,7,8,9]
;     }
; }

!let json = loadJson("json3.json")

!for n in json.screens {
    !for byte in json[n].bytes {
        lda #byte
    }
    nop
}
