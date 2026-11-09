@echo off
REM ==================================================================
REM  ARCSLAB - update publications by hand (Windows)
REM  Double-click this file inside the repository folder.
REM  Needs: Git for Windows and Python 3 (https://www.python.org)
REM ==================================================================
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul && (set PY=python) || (set PY=py -3)

echo.
echo [1/5] Getting the latest version from GitHub...
git pull --rebase --autostash || goto :error

echo.
echo [2/5] Checking which sources respond...
%PY% scripts\publications.py probe

echo.
echo [3/5] Syncing new papers and citations from OpenAlex...
%PY% scripts\publications.py sync

echo.
echo [4/5] Classifying papers (rules + overrides)...
%PY% scripts\publications.py classify || goto :error

echo.
echo [5/5] Saving to GitHub...
git add data\publications.csv data\publications_meta.json
git diff --cached --quiet && (echo Nothing new to commit.) || (
  git commit -m "Update publications (manual sync)" && git push || goto :error
)

echo.
echo Done.
pause
exit /b 0

:error
echo.
echo *** Something went wrong. Read the messages above. ***
pause
exit /b 1
