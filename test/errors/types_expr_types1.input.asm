* = $801

    lda #"foo" + 1   ; can't mix strings and numbers
    lda #1 + "foo"   ; can't mix strings and numbers

!let a = "foo" / "bar" ; only +,== and comparison are ok for stirngs
