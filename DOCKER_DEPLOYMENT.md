# Docker Deployment Guide

This guide explains how to deploy the SheetChain services using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Google Cloud Service Account credentials
- Environment variables configured

## Quick Start

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** with your configuration:
   - Set `GOOGLE_SHEET_ID`
   - Configure Google credentials (either file path or inline)
   - Set private keys for bridge operations
   - Configure chain-specific settings

3. **Place Google credentials** (if using file-based auth):
   ```bash
   # For RPC Node
   cp your-service-account.json rpc-node/cred/service-account.json
   
   # For Bridge Backend (if different)
   cp your-service-account.json sheet-bridge-core/be/cred/service-account.json
   ```

4. **Build and start services:**
   ```bash
   docker-compose up -d
   ```

5. **Check service status:**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

## Services

### RPC Node
- **Port:** 8545
- **Health Check:** `http://localhost:8545/health`
- **Purpose:** Ethereum-compatible RPC node using Google Sheets as state storage

### Bridge Backend
- **Purpose:** Monitors bridge events and processes cross-chain transfers
- **Dependencies:** Requires RPC Node to be healthy before starting

## Environment Variables

See `.env.example` for all available environment variables.

### Required Variables

**RPC Node:**
- `GOOGLE_SHEET_ID` - Your Google Sheet ID
- Google credentials (either `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`)

**Bridge Backend:**
- `SHEET_PRIVATE_KEY` - Private key for Sheet Chain operations
- `BSC_PRIVATE_KEY` - Private key for BSC operations
- `GOOGLE_SHEET_ID` - Same as RPC Node

### Optional Variables

- `SOLANA_SECRET_KEY` - Enable Solana bridge support
- `BRIDGE_POLL_INTERVAL_MS` - Polling interval for bridge events (default: 10000ms)
- `LOG_LEVEL` - Logging level (default: info)

## Deployment to Cloud Platforms

### Google Cloud Platform (GCP)

#### Using Cloud Run

1. **Build and push images to GCR:**
   ```bash
   # Set your GCP project
   export GCP_PROJECT=your-project-id
   gcloud config set project $GCP_PROJECT
   
   # Build and push RPC Node
   docker build -t gcr.io/$GCP_PROJECT/sheetchain-rpc-node ./rpc-node
   docker push gcr.io/$GCP_PROJECT/sheetchain-rpc-node
   
   # Build and push Bridge Backend
   docker build -t gcr.io/$GCP_PROJECT/sheetchain-bridge-backend ./sheet-bridge-core/be
   docker push gcr.io/$GCP_PROJECT/sheetchain-bridge-backend
   ```

2. **Deploy to Cloud Run:**
   ```bash
   # Deploy RPC Node
   gcloud run deploy sheetchain-rpc-node \
     --image gcr.io/$GCP_PROJECT/sheetchain-rpc-node \
     --platform managed \
     --region us-central1 \
     --port 8545 \
     --allow-unauthenticated \
     --set-env-vars "GOOGLE_SHEET_ID=your-sheet-id,CHAIN_ID=12345" \
     --set-secrets "GOOGLE_SERVICE_ACCOUNT_EMAIL=google-email:latest,GOOGLE_PRIVATE_KEY=google-key:latest"
   
   # Deploy Bridge Backend
   gcloud run deploy sheetchain-bridge-backend \
     --image gcr.io/$GCP_PROJECT/sheetchain-bridge-backend \
     --platform managed \
     --region us-central1 \
     --set-env-vars "SHEET_RPC_URL=https://sheetchain-rpc-node-xxx.run.app,SHEET_PRIVATE_KEY=xxx" \
     --set-secrets "BSC_PRIVATE_KEY=bsc-key:latest"
   ```

#### Using Compute Engine with Docker Compose

1. **Create VM instance:**
   ```bash
   gcloud compute instances create sheetchain-vm \
     --machine-type=e2-medium \
     --image-family=cos-stable \
     --image-project=cos-cloud \
     --boot-disk-size=20GB
   ```

2. **SSH into VM and install Docker:**
   ```bash
   gcloud compute ssh sheetchain-vm
   # On VM:
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Copy files and deploy:**
   ```bash
   # From local machine
   gcloud compute scp --recurse . sheetchain-vm:~/sheetchain
   gcloud compute ssh sheetchain-vm
   
   # On VM:
   cd ~/sheetchain
   docker-compose up -d
   ```

### AWS

#### Using ECS (Elastic Container Service)

1. **Create ECR repositories:**
   ```bash
   aws ecr create-repository --repository-name sheetchain-rpc-node
   aws ecr create-repository --repository-name sheetchain-bridge-backend
   ```

2. **Build and push images:**
   ```bash
   # Login to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   
   # Build and push RPC Node
   docker build -t sheetchain-rpc-node ./rpc-node
   docker tag sheetchain-rpc-node:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/sheetchain-rpc-node:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/sheetchain-rpc-node:latest
   
   # Build and push Bridge Backend
   docker build -t sheetchain-bridge-backend ./sheet-bridge-core/be
   docker tag sheetchain-bridge-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/sheetchain-bridge-backend:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/sheetchain-bridge-backend:latest
   ```

3. **Create ECS Task Definition** (use AWS Console or CLI)
   - Configure environment variables
   - Set up secrets from AWS Secrets Manager
   - Configure networking and ports

#### Using EC2 with Docker Compose

1. **Launch EC2 instance:**
   - Use Amazon Linux 2 or Ubuntu
   - Security group: Allow port 8545 (RPC Node)

2. **Install Docker:**
   ```bash
   sudo yum update -y
   sudo yum install docker -y
   sudo service docker start
   sudo usermod -a -G docker ec2-user
   ```

3. **Install Docker Compose:**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

4. **Deploy:**
   ```bash
   # Copy files to EC2 (use scp or git clone)
   cd sheetchain
   docker-compose up -d
   ```

## Security Best Practices

1. **Use Secrets Management:**
   - GCP: Secret Manager
   - AWS: Secrets Manager or Parameter Store
   - Never commit `.env` files

2. **Network Security:**
   - Use private networks for inter-service communication
   - Expose only necessary ports
   - Use load balancers with SSL/TLS

3. **Credentials:**
   - Use service account keys with minimal permissions
   - Rotate keys regularly
   - Use IAM roles where possible (AWS) or Workload Identity (GCP)

4. **Database:**
   - Bridge backend uses SQLite (stored in Docker volume)
   - For production, consider migrating to managed database (RDS, Cloud SQL)

## Monitoring

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f rpc-node
docker-compose logs -f bridge-backend
```

### Health Checks
```bash
# RPC Node health
curl http://localhost:8545/health

# Check container status
docker-compose ps
```

## Troubleshooting

### Services won't start
- Check environment variables: `docker-compose config`
- Check logs: `docker-compose logs`
- Verify Google credentials are accessible

### RPC Node can't connect to Google Sheets
- Verify `GOOGLE_SHEET_ID` is correct
- Check service account has access to the sheet
- Verify credentials file path or inline credentials

### Bridge Backend can't connect to RPC Node
- Check `SHEET_RPC_URL` points to correct service
- Verify network connectivity between containers
- Check RPC Node health endpoint

### Database issues
- SQLite database is stored in Docker volume `bridge-db-data`
- To reset: `docker-compose down -v` (WARNING: deletes data)

## Scaling

For production scaling:
- Use managed container services (Cloud Run, ECS, Kubernetes)
- Implement proper load balancing
- Use managed databases instead of SQLite
- Set up monitoring and alerting
- Implement auto-scaling based on metrics

## Backup

### Database Backup
```bash
# Backup SQLite database
docker-compose exec bridge-backend cp /app/data/bridge.db /app/data/bridge.db.backup

# Copy from container
docker cp sheetchain-bridge-backend:/app/data/bridge.db ./backup/
```

### Google Sheets
- Google Sheets are automatically backed up by Google
- Consider exporting critical data periodically
