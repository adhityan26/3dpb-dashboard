# CI/CD

## Auto-deploy via GitHub Actions

Setiap push ke `master` → build Docker image → push ke GHCR.

## Update server (manual)

SSH ke server lalu:
```bash
cd /opt/stacks/shopee-dashboard
./deploy.sh pull
```

Atau buat script shortcut di server:
```bash
#!/bin/bash
# /opt/stacks/shopee-dashboard/update.sh
cd /opt/stacks/shopee-dashboard
./deploy.sh pull
```
