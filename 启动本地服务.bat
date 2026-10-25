@echo off
chcp 65001 >nul
title 单词大冒险 · 本地服务
echo ============================================
echo   单词大冒险 本地服务已启动
echo   电脑访问: http://localhost:8931
echo   手机访问: http://本机IPv4地址:8931
echo   (IPv4 地址可用 ipconfig 查看)
echo   关闭此窗口即停止服务
echo ============================================
start "" http://localhost:8931
cd /d "%~dp0"
python -m http.server 8931 2>nul || py -m http.server 8931
pause
