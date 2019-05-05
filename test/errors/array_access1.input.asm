
* = $801

!let json = loadJson("array_access1.json")

    lda #json.numSprites  ; this should work
    lda #json.data[0]     ; this should work
    lda #json.data[1]     ; this should work
    lda #json.data[4]     ; out of bounds access
