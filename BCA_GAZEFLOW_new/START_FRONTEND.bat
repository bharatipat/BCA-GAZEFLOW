@echo off
color 0A
echo  =============================================
echo   GazeFlow Project - Starting Frontend
echo  =============================================
echo  Make sure START_BACKEND.bat is running first!
cd frontend
call npm install
call npm start
pause
