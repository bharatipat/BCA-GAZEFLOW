@echo off
color 0B
echo.
echo  Copying GazeFlow Project_Demo.html to Downloads...
echo  =============================================
echo   GazeFlow Project - Starting Backend
echo  =============================================
echo  Installing requirements...
pip install -r requirements.txt -q
echo  Starting Flask server on port 5000...
echo  Port 5000 = All features
echo.
cd backend
python app.py
pause
