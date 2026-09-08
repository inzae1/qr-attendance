# Passkey Attendance Upgrade

새 흐름
1. 관리자: ?admin=1
2. Passkey 탭에서 학생별 등록 링크 발급
3. 학생 휴대폰에서 링크 열고 Passkey 등록
4. 태블릿: ?kiosk=1
5. 관리자 PIN으로 키오스크 시작
6. 출근/퇴근 모드 선택
7. 학생이 15초 동적 QR 스캔
8. 학생 휴대폰의 Face ID/지문/화면잠금으로 승인
9. 출결 기록

배포 URL
https://inzae1.github.io/qr-attendance/

키오스크
https://inzae1.github.io/qr-attendance/?kiosk=1

관리자
https://inzae1.github.io/qr-attendance/?admin=1

추가 관리자 기능
- 기간별 출석 통계
- 학생별 출석률 / 지각 / 결석 / 평균 출근시간 / 조퇴 / 미퇴근
- 일자별 출석 추이
- CSV 다운로드
- Excel(.xlsx) 다운로드
  - 출결내역
  - 요약통계
  - 학생별통계
  - 일자별통계
