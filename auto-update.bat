@echo off
REM === Antidoto Design BI — Atualização automática diária ===
REM Roda fetch > build > push > deploy

cd /d "C:\Users\bertu\Downloads\bi-blueprint-main\antidotodesign-bi-web"

echo [%date% %time%] Iniciando atualização... >> auto-update.log

echo Fetch dados do Drive...
call node fetch-data.cjs >> auto-update.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERRO no fetch-data >> auto-update.log
    exit /b 1
)

echo Build data.js...
call node build-data.cjs >> auto-update.log 2>&1

echo Build extras...
call node build-data-extras.cjs >> auto-update.log 2>&1

echo Build JSX...
call node build-jsx.cjs >> auto-update.log 2>&1

echo Git push...
git add data.js data-extras.js app.bundle.js >> auto-update.log 2>&1
git commit -m "auto: daily data update %date%" >> auto-update.log 2>&1
git push origin master >> auto-update.log 2>&1

echo Deploy Coolify...
curl -s -X POST "http://187.77.238.125:8000/api/v1/applications/l2vjaruow1bk2ocl32fbyajc/restart" -H "Authorization: Bearer 73|6GgLZSzvGf9DaEgchZK0cHX8uyRqiNyvJescIgen96522e48" >> auto-update.log 2>&1

echo [%date% %time%] Atualização concluída >> auto-update.log
