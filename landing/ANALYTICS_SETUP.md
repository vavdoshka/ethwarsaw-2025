# Google Analytics Setup for SheetChain

## Quick Setup

1. **Get your Google Analytics 4 Measurement ID:**
   - Go to [Google Analytics](https://analytics.google.com)
   - Create a new GA4 property for `sheetchain.com`
   - Copy your Measurement ID (format: `G-XXXXXXXXXX`)

2. **Update the configuration:**
   - Open `ga-config.js`
   - Replace `GA_MEASUREMENT_ID` with your actual Measurement ID
   - Save the file

3. **Deploy:**
   ```bash
   vercel --prod
   ```

## What's Tracked

### Automatic Events:
- **Page Views** - Standard page load tracking
- **Section Views** - When users scroll to different sections
- **CTA Clicks** - All call-to-action button clicks
- **External Links** - Clicks on external links
- **Scroll Depth** - How far users scroll (25%, 50%, 75%, 100%)
- **Time on Page** - How long users stay on the page

### Custom Events:
- `section_view` - When a section comes into view
- `cta_click` - When a CTA button is clicked
- `external_link_click` - When external links are clicked
- `scroll_depth` - Scroll progress milestones
- `time_on_page` - Session duration

## Configuration Options

In `ga-config.js`, you can customize:

```javascript
window.GA_CONFIG = {
  measurementId: 'G-XXXXXXXXXX', // Your GA4 ID
  debug: false,                  // Enable debug mode
  enhancedEcommerce: true,       // Enhanced ecommerce tracking
  customDimensions: {            // Custom dimensions
    // Add your custom dimensions here
  }
};
```

## Testing

1. **Enable Debug Mode:**
   - Set `debug: true` in `ga-config.js`
   - Open browser dev tools → Console
   - Look for GA debug messages

2. **Real-time Testing:**
   - Go to GA4 → Reports → Realtime
   - Visit your site and perform actions
   - Verify events appear in real-time

3. **Event Testing:**
   - Use Google Tag Assistant browser extension
   - Check GA4 DebugView for detailed event data

## Privacy Compliance

The current setup is GDPR-friendly as it:
- Only tracks essential analytics data
- Doesn't use cookies for tracking (uses GA4's privacy-focused approach)
- Provides clear data collection purposes

For full GDPR compliance, consider adding:
- Cookie consent banner
- Privacy policy page
- Data retention settings in GA4

## Troubleshooting

**Analytics not working?**
1. Check if Measurement ID is correct
2. Verify domain is added to GA4 property
3. Check browser console for errors
4. Ensure ad blockers aren't blocking GA

**Events not showing?**
1. Enable debug mode
2. Check GA4 DebugView
3. Verify event parameters are correct
4. Wait 24-48 hours for data to appear in reports
