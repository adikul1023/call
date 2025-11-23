# GitHub Upload Script for SecureVoice
# Run this script after creating your GitHub repository

Write-Host "=== SecureVoice GitHub Upload ===" -ForegroundColor Cyan
Write-Host ""

# Check if git is installed
try {
    git --version | Out-Null
} catch {
    Write-Host "❌ Git is not installed!" -ForegroundColor Red
    Write-Host "Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit
}

Write-Host "✅ Git is installed" -ForegroundColor Green
Write-Host ""

# Get repository URL from user
Write-Host "Enter your GitHub repository URL:" -ForegroundColor Yellow
Write-Host "Example: https://github.com/YourOrgName/SecureVoice.git" -ForegroundColor Gray
$repoUrl = Read-Host "Repository URL"

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    Write-Host "❌ Repository URL is required!" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "📦 Initializing git repository..." -ForegroundColor Cyan

# Initialize git if not already initialized
if (-not (Test-Path ".git")) {
    git init
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
} else {
    Write-Host "✅ Git repository already exists" -ForegroundColor Green
}

# Create .gitignore if it doesn't exist
if (-not (Test-Path ".gitignore")) {
    Write-Host "📝 Creating .gitignore..." -ForegroundColor Cyan
    @"
# Node modules
node_modules/

# Database
*.db
*.sqlite
*.sqlite3
securevoice.db

# Logs
logs/
*.log

# Environment variables
.env
.env.local

# SSL Certificates (optional - remove if you want to include them)
*.pem
*.key
*.crt

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Build files
dist/
build/

# Temporary files
tmp/
temp/
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    Write-Host "✅ .gitignore created" -ForegroundColor Green
}

# Add all files
Write-Host ""
Write-Host "📁 Adding files to git..." -ForegroundColor Cyan
git add .
Write-Host "✅ Files added" -ForegroundColor Green

# Commit
Write-Host ""
Write-Host "💾 Creating initial commit..." -ForegroundColor Cyan
git commit -m "Initial commit: SecureVoice - Secure voice calling platform"
Write-Host "✅ Commit created" -ForegroundColor Green

# Add remote
Write-Host ""
Write-Host "🔗 Adding remote repository..." -ForegroundColor Cyan
git remote remove origin 2>$null  # Remove if exists
git remote add origin $repoUrl
Write-Host "✅ Remote added" -ForegroundColor Green

# Push to GitHub
Write-Host ""
Write-Host "⬆️  Pushing to GitHub..." -ForegroundColor Cyan
Write-Host "You may be asked to login to GitHub..." -ForegroundColor Yellow
git branch -M main
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 SUCCESS! SecureVoice uploaded to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "View your repository at:" -ForegroundColor Cyan
    Write-Host $repoUrl.Replace(".git", "") -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Upload failed. Check the error above." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  1. Make sure you created the repository on GitHub first" -ForegroundColor Gray
    Write-Host "  2. Check your GitHub credentials" -ForegroundColor Gray
    Write-Host "  3. Verify the repository URL is correct" -ForegroundColor Gray
}
