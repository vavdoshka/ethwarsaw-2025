// Google Analytics Configuration
// Replace 'GA_MEASUREMENT_ID' with your actual Google Analytics 4 Measurement ID
// Format: G-XXXXXXXXXX

window.GA_CONFIG = {
  measurementId: 'GA_MEASUREMENT_ID', // Replace with your GA4 Measurement ID
  debug: false, // Set to true for development debugging
  enhancedEcommerce: true,
  customDimensions: {
    // Add custom dimensions if needed
    // dimension1: 'user_type',
    // dimension2: 'content_category'
  }
};

// Example GA4 Measurement ID formats:
// G-XXXXXXXXXX (most common)
// UA-XXXXXXXXX-X (Universal Analytics - deprecated)
// GTM-XXXXXXX (Google Tag Manager)
