
* = $801

; {
;     "numSprites": 3,
;     "numFrames": 3
; }

!let json = loadJson("json4.json")

    lda #json.numSprites
    lda #json.numFrames
    lda #json.numSprites * json.numFrames
