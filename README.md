# QR Attendance

고정 QR 2개를 사용하는 소규모 출결 시스템.

## URL
GitHub Pages 활성화 후:

- 출근: `https://inzae1.github.io/qr-attendance/?mode=in`
- 퇴근: `https://inzae1.github.io/qr-attendance/?mode=out`
- 관리자: `https://inzae1.github.io/qr-attendance/?admin=1`

## 현재 테스트 계정
- 학생1: 1111
- 학생2: 2222
- 학생3: 3333
- 학생4: 4444
- 학생5: 5555
- 학생6: 6666
- 학생7: 7777
- 학생8: 8888
- 관리자 PIN: 1234

## 규칙
- 출근 기준 10:00
- 퇴근 기준 17:00
- 날짜/시간은 브라우저가 아니라 Supabase DB 서버의 `now()` 기준
- 한국 날짜는 `Asia/Seoul`
- 같은 사람/날짜/출근·퇴근 유형은 최초 기록만 저장
