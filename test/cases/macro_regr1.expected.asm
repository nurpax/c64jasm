0801: A9 0D        LDA #$0D
0803: 8D 20 D0     STA $D020
0806: A9 00        LDA #$00
0808: A2 10        LDX #$10
080A: 20 10 08     JSR $0810
080D: CA           DEX
080E: 10 FA        BPL $080A
0810: 60           RTS
