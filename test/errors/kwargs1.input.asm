
!segment code1(start=$1000, end=$1100, woot=3)  ; unknown arg 'woot'
!segment code2(start=$1200)  ; missing arg 'end'
!segment code3(start=$1300, end=$1320, start=$1300, start=$1330) ; duplicate 'start'
