# Script d'installation des Debug Endpoints pour Postman

Write-Host "🔧 Installation des Debug Endpoints..." -ForegroundColor Cyan

# 1. Arrêter tous les serveurs node sur port 3000
Write-Host "`n1️⃣ Arrêt des serveurs existants..." -ForegroundColor Yellow

$port3000Process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($port3000Process) {
    Write-Host "   Arrêt du processus sur port 3000 (PID: $port3000Process)..." -ForegroundColor Gray
    Stop-Process -Id $port3000Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "   ✅ Serveur arrêté" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Aucun serveur sur port 3000" -ForegroundColor Gray
}

# 2. Modifier server.js pour ajouter les imports
Write-Host "`n2️⃣ Ajout des imports dans server.js..." -ForegroundColor Yellow

$serverFile = "C:\gitprojects\LSAPISFCRM\salesforce-backend\server.js"
$content = Get-Content $serverFile -Raw

# Ajouter l'import du module debug-endpoints
if ($content -notmatch "setupDebugEndpoints") {
    $importLine = "const fieldConfigStorage = require\('./fieldConfigStorage'\);"
    $newImportLine = "const fieldConfigStorage = require('./fieldConfigStorage');`nconst setupDebugEndpoints = require('./debug-endpoints');"

    $content = $content -replace [regex]::Escape($importLine), $newImportLine
    Write-Host "   ✅ Import ajouté" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Import déjà présent" -ForegroundColor Gray
}

# 3. Ajouter l'appel à setupDebugEndpoints
Write-Host "`n3️⃣ Activation des endpoints..." -ForegroundColor Yellow

if ($content -notmatch "setupDebugEndpoints\(app") {
    # Chercher la ligne "// Health check"
    $healthCheckPattern = "// Health check\s+app\.get\('/api/health'"

    # Insérer juste avant le health check
    $debugSetup = @"
// DEBUG ENDPOINTS: Inspect Salesforce metadata via Postman
setupDebugEndpoints(app, getCurrentOrgId, getConnection);

// Health check
app.get('/api/health'
"@

    $content = $content -replace $healthCheckPattern, $debugSetup
    Write-Host "   ✅ Endpoints activés" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Endpoints déjà activés" -ForegroundColor Gray
}

# Sauvegarder le fichier
Set-Content -Path $serverFile -Value $content -NoNewline

# 4. Redémarrer le serveur
Write-Host "`n4️⃣ Démarrage du serveur..." -ForegroundColor Yellow

$job = Start-Job -ScriptBlock {
    Set-Location "C:\gitprojects\LSAPISFCRM\salesforce-backend"
    node server.js
}

Start-Sleep -Seconds 3

# Vérifier que le serveur a démarré
$serverRunning = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($serverRunning) {
    Write-Host "   ✅ Serveur démarré sur http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Le serveur n'a pas démarré. Vérifiez les logs." -ForegroundColor Yellow
}

# 5. Résumé
Write-Host "`n✅ Installation terminée!" -ForegroundColor Green
Write-Host "`n📋 Endpoints disponibles:" -ForegroundColor Cyan
Write-Host "   GET  http://localhost:3000/api/salesforce/metadata/lead" -ForegroundColor White
Write-Host "   GET  http://localhost:3000/api/salesforce/metadata/countrycodes" -ForegroundColor White
Write-Host "   POST http://localhost:3000/api/salesforce/metadata/test-country-validation" -ForegroundColor White

Write-Host "`n⚠️  IMPORTANT:" -ForegroundColor Yellow
Write-Host "   1. Ouvrez http://localhost:3000/displayLeadTransfer" -ForegroundColor White
Write-Host "   2. Connectez-vous à Salesforce" -ForegroundColor White
Write-Host "   3. Ensuite utilisez Postman avec la collection" -ForegroundColor White

Write-Host "`n📁 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "   1. Importer POSTMAN_METADATA_COLLECTION.json dans Postman" -ForegroundColor White
Write-Host "   2. Lire GUIDE_POSTMAN_METADATA.md pour les exemples" -ForegroundColor White
Write-Host "   3. Tester les endpoints!" -ForegroundColor White

Write-Host "`n🔄 Le serveur tourne en background (Job ID: $($job.Id))" -ForegroundColor Gray
Write-Host "   Pour arrêter: Stop-Job -Id $($job.Id); Remove-Job -Id $($job.Id)`n" -ForegroundColor Gray
