#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""单词大冒险 · 本地静态服务器（python 标准库，无第三方依赖）

相比 `python -m http.server` 的关键差异：每个响应带 `Cache-Control: no-cache`。
http.server 只发 Last-Modified 不发 Cache-Control，Chromium 会按「启发式新鲜期」
（约文件未被修改时长的 10%）直接复用本地缓存的旧文件——版本更新后刷新，浏览器可能
继续用旧 CSS/JS 造成新旧混版。no-cache 让浏览器每次使用缓存前都向服务器再验证
（配合 Last-Modified / If-Modified-Since，未变更的文件返回 304 不重传，几乎零开销），
版本更新后刷新一次即拿到全部最新文件。

局域网部署用（http 非安全上下文，Service Worker 不可用，见 deploy.md 方式三）；
https / GitHub Pages 部署的新鲜度由 sw.js 的 no-cache 再验证负责，与本文件无关。

用法：python server.py [端口]    （默认 8931，与 启动本地服务.bat 一致）
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ThreadingHTTPServer(('0.0.0.0', port), NoCacheHandler).serve_forever()


if __name__ == '__main__':
    main()
