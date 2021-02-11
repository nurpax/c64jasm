0801: 07 20        SLO $20
0803: 17 20        SLO $20,X
0805: 0F 00 20     SLO $2000
0808: 1F 00 20     SLO $2000,X
080B: 1B 00 20     SLO $2000,Y
080E: 03 44        SLO ($44,X)
0810: 13 44        SLO ($44),Y
0812: EA           NOP
0813: 0B 00        ANC #$00
0815: EA           NOP
0816: 27 20        RLA $20
0818: 37 20        RLA $20,X
081A: 2F 00 20     RLA $2000
081D: 3F 00 20     RLA $2000,X
0820: 3B 00 20     RLA $2000,Y
0823: 23 44        RLA ($44,X)
0825: 33 44        RLA ($44),Y
0827: EA           NOP
0828: 47 20        SRE $20
082A: 57 20        SRE $20,X
082C: 4F 00 20     SRE $2000
082F: 5F 00 20     SRE $2000,X
0832: 5B 00 20     SRE $2000,Y
0835: 43 44        SRE ($44,X)
0837: 53 44        SRE ($44),Y
0839: EA           NOP
083A: 67 20        RRA $20
083C: 77 20        RRA $20,X
083E: 6F 00 20     RRA $2000
0841: 7F 00 20     RRA $2000,X
0844: 7B 00 20     RRA $2000,Y
0847: 63 44        RRA ($44,X)
0849: 73 44        RRA ($44),Y
084B: EA           NOP
084C: 87 20        SAX $20
084E: 97 20        SAX $20,Y
0850: 8F 00 20     SAX $2000
0853: 83 44        SAX ($44,X)
0855: EA           NOP
0856: EA           NOP
0857: EA           NOP
0858: 9B 00 20     TAS $2000,Y
085B: EA           NOP
085C: 9C 00 20     SHY $2000,X
085F: EA           NOP
0860: 9E 00 20     SHX $2000,Y
0863: EA           NOP
0864: A7 00        LAX $00
0866: A7 20        LAX $20
0868: B7 20        LAX $20,Y
086A: AF 00 20     LAX $2000
086D: BF 00 20     LAX $2000,Y
0870: A3 44        LAX ($44,X)
0872: B3 44        LAX ($44),Y
0874: EA           NOP
0875: BB 00 20     LAS $2000,Y
0878: EA           NOP
0879: C7 20        DCP $20
087B: D7 20        DCP $20,X
087D: CF 00 20     DCP $2000
0880: DF 00 20     DCP $2000,X
0883: DB 00 20     DCP $2000,Y
0886: C3 44        DCP ($44,X)
0888: D3 44        DCP ($44),Y
088A: EA           NOP
088B: E7 20        ISC $20
088D: F7 20        ISC $20,X
088F: EF 00 20     ISC $2000
0892: FF 00 20     ISC $2000,X
0895: FB 00 20     ISC $2000,Y
0898: E3 44        ISC ($44,X)
089A: F3 44        ISC ($44),Y
089C: EA           NOP
089D: 4B 00        ALR #$00
089F: EA           NOP
08A0: CB 00        AXS #$00
08A2: EA           NOP
08A3: 6B 00        ARR #$00
