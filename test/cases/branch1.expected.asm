0801: AE 12 D0     LDX $D012
0804: AD 11 D0     LDA $D011
0807: 29 80        AND #80
0809: D0 F6        BNE $0801
080B: E0 00        CPX #00
080D: D0 F2        BNE $0801
080F: A9 00        LDA #00
0811: 8D 20 D0     STA $D020
0814: 8D 21 D0     STA $D021
