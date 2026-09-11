# -*- coding: utf-8 -*-
"""
세라젬 웰라운지 프로토타입 로컬 서버
· python -m http.server 와 같지만, 브라우저가 파일을 캐시하지 않도록 헤더를 붙임
  (파일을 고친 뒤 새로고침만 해도 항상 최신 버전이 뜨게)
· 실행: python server.py   → http://localhost:8000  (매니저: /manager/)
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 캐시 금지 — css/js/json 을 수정하면 새로고침만으로 바로 반영
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 요청 로그를 짧게
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableServer(("", PORT), NoCacheHandler) as httpd:
        print("=" * 48)
        print(" 세라젬 웰라운지 프로토타입 서버")
        print(f" 고객용  : http://localhost:{PORT}/")
        print(f" 매니저용: http://localhost:{PORT}/manager/")
        print(" 종료: Ctrl+C")
        print("=" * 48)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
