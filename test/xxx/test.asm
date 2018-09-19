FALSE=0
TRUE=1

irq0_line = 100
irq1_line = 150

!sd macro basic_start(addr) {
* = $801
    !byte $0c
    !byte $08
    !byte $00
    !byte $00
    !byte $9e
!if (addr >= 10000) {
    !byte $30 + (addr/10000)%10
}
!if (addr >= 1000) {
    !byte $30 + (addr/1000)%10
}
!if (addr >= 100) {
    !byte $30 + (addr/100)%10
}
!if (addr >= 10) {
    !byte $30 + (addr/10)%10
}
    !byte $30 + addr % 10
    !byte 0, 0, 0
}

!macro SetupIRQ(IRQaddr,IRQline,IRQlineHi) {
    lda #$7f        
    sta $dc0d
    sta $dd0d

    lda #<IRQaddr   
    ldx #>IRQaddr   
    sta $fffe       
    stx $ffff

    lda #$01        
    sta $d01a
    lda #IRQline    
    sta $d012
    !if (IRQline > 255) {
        nop ;; this should be an error, but no !error yet
    }
    lda $d011   
    and #$7f
    sta $d011

    asl $d019  
    bit $dc0d  
    bit $dd0d  
}

!macro EndIRQ(nextIRQaddr,nextIRQline,IRQlineHi) {
    asl $d019
    lda #<nextIRQaddr
    sta $fffe
    lda #>nextIRQaddr
    sta $ffff
    lda #nextIRQline
    sta $d012
    !if(IRQlineHi) {
        lda $d011
        ora #$80
        sta $d011
    }
}

!macro irq_start(end_lbl) {
    sta end_lbl-6
    stx end_lbl-4
    sty end_lbl-2
}

!macro irq_end(next, line) {
    +EndIRQ(next, line, FALSE)
    lda #$00
    ldx #$00
    ldy #$00
    rti
}

!macro double_irq(end, stableIRQ) {
    +irq_start(end)

    lda #<stableIRQ 
    ldx #>stableIRQ 


    sta $fffe
    stx $ffff       
    inc $d012       
    asl $d019       
    tsx             
    cli            


    nop 
    nop 
    nop 
    nop 
    nop 
    nop 
    nop 
}

!macro foo(~x) {
    lda #0
x:
}

+basic_start(start)

* = $810
start:
    +foo(xyz0)
    +foo(xyz1)
    lda #0
    sta xyz0-1
    sta xyz1-1

    sei
    lda #$35        
    sta $01         

    +SetupIRQ(irq0, irq0_line, FALSE)
    cli

loop:
    jmp loop


irq0: {
    +irq_start(.end)

    lda #0
    sta $d020

    +irq_end(irq1, irq1_line)
.end:
}

irq1: {
    +irq_start(.end)

    lda #15
    sta $d020

    +irq_end(irq0, irq0_line)
.end:
}