@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  세라젬 웰라운지 셀프 문진 - 로컬 서버 시작
echo  고객용 화면 : http://localhost:8000
echo  매니저 화면 : http://localhost:8000/manager/
echo  (태블릿은 같은 와이파이에서 http://이PC의IP:8000)
echo  종료: 이 창을 닫거나 Ctrl+C
echo ============================================
start "" http://localhost:8000
python server.py 8000
if errorlevel 1 (
  echo.
  echo [오류] Python이 설치되어 있지 않거나 8000번 포트가 이미 사용 중입니다.
  echo  - Python: https://www.python.org/downloads  (설치 시 "Add Python to PATH" 체크)
  echo  - 포트 충돌: 이미 켜져 있는 서버 창을 닫고 다시 실행하세요.
  pause
)
