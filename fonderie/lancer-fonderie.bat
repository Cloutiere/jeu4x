@echo off
rem FONDERIE 3D — lance le visualiseur (serveur statique local, port 5178)
cd /d "%~dp0"
start "" http://localhost:5178/
node serveur.mjs
