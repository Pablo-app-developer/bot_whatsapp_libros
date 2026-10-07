@echo off
cls
echo ============================================
echo    Bot WhatsApp Libros - INICIO RAPIDO
echo ============================================
echo.

REM Verificar si Node.js esta instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no esta instalado!
    echo.
    echo Descarga Node.js desde: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js instalado
echo.

REM Verificar si existe .env
if not exist ".env" (
    echo [ADVERTENCIA] No se encontro .env
    echo.
    echo Configurando archivo .env...
    copy ".env.example" ".env" >nul
    echo.
    echo [ACCION REQUERIDA] Edita .env con tus credenciales
    echo    - WHATSAPP_API_TOKEN
    echo    - WHATSAPP_PHONE_NUMBER_ID
    echo    - GEMINI_API_KEY
    echo    - WHATSAPP_WEBHOOK_VERIFY_TOKEN
    echo.
    echo Presiona cualquier tecla para abrir el archivo .env...
    pause >nul
    notepad ".env"
    echo.
)

REM Verificar si hay node_modules
if not exist "node_modules" (
    echo [INFO] Instalando dependencias...
    call npm install
    echo.
)

echo ============================================
echo    INICIANDO SERVIDOR WHATSAPP BOT
echo ============================================
echo.
echo El servidor se iniciara en: http://localhost:3001
echo.
echo [IMPORTANTE]
echo 1. Asegurate de tener configurado .env
echo 2. En otra terminal, ejecuta: ngrok http 3001
echo 3. Configura el webhook en Meta for Developers
echo.
echo Presiona Ctrl+C para detener el servidor
echo.
echo ============================================
echo.

call npm start
