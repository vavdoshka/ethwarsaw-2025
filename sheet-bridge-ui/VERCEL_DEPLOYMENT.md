# Vercel Deployment Guide for Sheet Bridge UI

This guide will help you deploy the Sheet Bridge UI to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. The Vercel CLI installed (optional, for CLI deployment)
3. Your repository pushed to GitHub/GitLab/Bitbucket

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Click "Add New..." → "Project"

2. **Import Your Repository**
   - Connect your Git provider (GitHub/GitLab/Bitbucket)
   - Select the repository containing `sheet-bridge-ui`
   - Select the root directory: `sheet-bridge-ui`

3. **Configure Project Settings**
   - **Framework Preset**: Vite (should auto-detect)
   - **Root Directory**: `sheet-bridge-ui`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
   - **Install Command**: `npm install` (default)

4. **Environment Variables** (Optional)
   - If you need to override any configuration, add environment variables:
     - `VITE_BRIDGE_OPERATOR_ADDRESS` - Bridge operator address (optional, has default)
     - `VITE_SOL_SKIP_PREFLIGHT` - Skip Solana preflight checks (optional)
     - `VITE_SOL_SIMULATE_BEFORE_SEND` - Simulate Solana transactions (optional)
     - `VITE_SOL_LOG_SIMULATION` - Log Solana simulation (optional)

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Navigate to the UI directory**
   ```bash
   cd sheet-bridge-ui
   ```

4. **Deploy**
   ```bash
   vercel
   ```
   
   For production deployment:
   ```bash
   vercel --prod
   ```

## Configuration

The app is already configured with:
- ✅ RPC endpoint: `https://rpc-testnet.sheetchain.com`
- ✅ Solana devnet endpoint
- ✅ BSC testnet endpoint
- ✅ Default bridge operator address

All configuration is in `src/config.ts` and can be overridden with environment variables if needed.

## Post-Deployment

After deployment, your app will be available at:
- **Preview URL**: `https://your-project-git-branch.vercel.app` (for each branch)
- **Production URL**: `https://your-project.vercel.app` (for main/master branch)

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure Node.js version is compatible (Vercel uses Node 18+ by default)
- Check build logs in Vercel dashboard

### App Not Loading
- Verify the `vercel.json` file is in the `sheet-bridge-ui` directory
- Check that the output directory is set to `dist`
- Ensure all routes are properly configured for SPA routing

### Environment Variables
- Environment variables prefixed with `VITE_` are available in the browser
- Set them in Vercel Dashboard → Project Settings → Environment Variables
- Redeploy after adding new environment variables

## Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Vercel will automatically provision SSL certificates

## Continuous Deployment

Vercel automatically deploys:
- Every push to the main/master branch → Production
- Every push to other branches → Preview deployment
- Every pull request → Preview deployment

You can disable this in Project Settings → Git if needed.
