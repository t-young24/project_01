@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  세라젬 웰라운지 셀프 문진 - 로컬 서버 시작
echo  브라우저: http://localhost:8000
echo  (태블릿은 같은 와이파이에서 http://이PC의IP:8000)
echo  종료: 이 창을 닫거나 Ctrl+C
echo ============================================
start "" http://localhost:8000
python -m http.server 8000
if errorlevel 1 (
  echo.
  echo [오류] Python이 설치되어 있지 않습니다.
  echo  https://www.python.org/downloads 에서 설치 후 다시 실행하세요.
  echo  (설치 시 "Add Python to PATH" 체크)
  pause
)
