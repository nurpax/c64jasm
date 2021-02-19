!segment music(start=$4000, end=$9fff)
!let music = { init: $2000 } ; duplicate symbol 'music' not allowed

    lda #music.init
