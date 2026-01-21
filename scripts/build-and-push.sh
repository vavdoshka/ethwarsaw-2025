#!/bin/bash

# Build and push Docker images to AWS ECR
# This script handles cross-platform builds (macOS M1 -> Linux AMD64)
# Usage: ./build-and-push.sh [--profile PROFILE_NAME] [--account-id ACCOUNT_ID] [--region REGION]

set -e

# Parse command line arguments
AWS_PROFILE=""
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="902230975350"

while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            AWS_PROFILE="$2"
            shift 2
            ;;
        --account-id)
            AWS_ACCOUNT_ID="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--profile PROFILE_NAME] [--account-id ACCOUNT_ID] [--region REGION]"
            echo ""
            echo "Options:"
            echo "  --profile PROFILE_NAME    AWS profile to use (default: default profile)"
            echo "  --account-id ACCOUNT_ID   AWS account ID (default: 902230975350)"
            echo "  --region REGION          AWS region (default: eu-central-1)"
            echo ""
            echo "Example:"
            echo "  $0 --profile personal --account-id 123456789012"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Configuration
ECR_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/sheetchain"
RPC_NODE_IMAGE="${ECR_REPOSITORY}:rpc-node"
BRIDGE_BACKEND_IMAGE="${ECR_REPOSITORY}:bridge-backend"
# Note: Images are tagged as :rpc-node and :bridge-backend (not :latest)

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Building and Pushing SheetChain Docker Images ===${NC}\n"

# Display configuration
if [ -n "$AWS_PROFILE" ]; then
    echo -e "${BLUE}Using AWS Profile: ${AWS_PROFILE}${NC}"
    export AWS_PROFILE=$AWS_PROFILE
fi
echo -e "${BLUE}AWS Account ID: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${BLUE}AWS Region: ${AWS_REGION}${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${YELLOW}Error: AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Verify AWS credentials
echo -e "${BLUE}Verifying AWS credentials...${NC}"
if [ -n "$AWS_PROFILE" ]; then
    AWS_IDENTITY=$(aws sts get-caller-identity --profile "$AWS_PROFILE" 2>&1)
else
    AWS_IDENTITY=$(aws sts get-caller-identity 2>&1)
fi

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Error: Failed to verify AWS credentials${NC}"
    echo "$AWS_IDENTITY"
    echo ""
    echo "To set up your personal AWS profile, run:"
    echo "  aws configure --profile personal"
    exit 1
fi

echo -e "${GREEN}✓ AWS credentials verified${NC}"
echo "$AWS_IDENTITY" | grep -E "(Account|UserId|Arn)" | sed 's/^/  /'
echo ""

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${YELLOW}Error: Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Login to ECR
echo -e "${BLUE}Logging in to AWS ECR...${NC}"
if [ -n "$AWS_PROFILE" ]; then
    aws ecr get-login-password --region ${AWS_REGION} --profile "$AWS_PROFILE" | docker login --username AWS --password-stdin ${ECR_REPOSITORY}
else
    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPOSITORY}
fi

# Create and use buildx builder for multi-platform builds
echo -e "${BLUE}Setting up Docker buildx for cross-platform builds...${NC}"
docker buildx create --name sheetchain-builder --use 2>/dev/null || docker buildx use sheetchain-builder
docker buildx inspect --bootstrap

# Build RPC Node image
echo -e "\n${GREEN}Building RPC Node image...${NC}"
TIMESTAMP_TAG=$(date +%Y%m%d-%H%M%S)
RPC_NODE_TIMESTAMP="${ECR_REPOSITORY}:rpc-node-${TIMESTAMP_TAG}"
docker buildx build \
    --platform linux/amd64 \
    --tag ${RPC_NODE_IMAGE} \
    --tag ${RPC_NODE_TIMESTAMP} \
    --push \
    --file ./rpc-node/Dockerfile \
    ./rpc-node

echo -e "${GREEN}✓ RPC Node image built and pushed${NC}"

# Build Bridge Backend image
echo -e "\n${GREEN}Building Bridge Backend image...${NC}"
BRIDGE_BACKEND_TIMESTAMP="${ECR_REPOSITORY}:bridge-backend-${TIMESTAMP_TAG}"
docker buildx build \
    --platform linux/amd64 \
    --tag ${BRIDGE_BACKEND_IMAGE} \
    --tag ${BRIDGE_BACKEND_TIMESTAMP} \
    --push \
    --no-cache \
    --file ./sheet-bridge-core/be/Dockerfile \
    ./sheet-bridge-core

echo -e "${GREEN}✓ Bridge Backend image built and pushed${NC}"

echo -e "\n${GREEN}=== Build Complete ===${NC}"
echo -e "RPC Node: ${RPC_NODE_IMAGE}"
echo -e "Bridge Backend: ${BRIDGE_BACKEND_IMAGE}"
echo -e "\nTimestamp tags:"
echo -e "  ${RPC_NODE_TIMESTAMP}"
echo -e "  ${BRIDGE_BACKEND_TIMESTAMP}"
