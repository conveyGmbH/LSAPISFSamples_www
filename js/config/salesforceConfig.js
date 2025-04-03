/* Configuration for integration with Salesforce */

export const appConfig = {
  // Automatic environment detection
  get isProduction() {
    const host = window.location.hostname;
    const port = window.location.port;
    
    // Consider as a development environment if:
    const isDevelopment = 
      host === 'localhost' || 
      host === '127.0.0.1' ||
      (host === '127.0.0.1' && port === '5504');
    
    return !isDevelopment;
  },
  
  // Environment-specific configuration
  get apiBaseUrl() {

    return this.isProduction
      ? 'https://lsapisamplesbackend-bhesadgtbja4dmgq.germanywestcentral-01.azurewebsites.net/api' 
      : 'http://localhost:3000/api';
  },
  
  // Additional information
  get environmentName() {
    return this.isProduction ? 'production' : 'development';
  },

};

// Logs for debugging
console.log(`Application running in ${appConfig.environmentName} mode`);
console.log(`API Base URL: ${appConfig.apiBaseUrl}`);

// Visual indicator in development environment
if (!appConfig.isProduction) {
  // Creates a visual indicator for the development environment
  const envIndicator = document.createElement('div');
  envIndicator.style.position = 'fixed';
  envIndicator.style.bottom = '10px';
  envIndicator.style.right = '10px';
  envIndicator.style.backgroundColor = '#ff6b6b';
  envIndicator.style.color = 'white';
  envIndicator.style.padding = '5px 10px';
  envIndicator.style.borderRadius = '5px';
  envIndicator.style.fontSize = '12px';
  envIndicator.style.zIndex = '9999';
  envIndicator.style.fontFamily = 'Arial, sans-serif';
  envIndicator.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  envIndicator.innerHTML = `DEV - API: ${appConfig.apiBaseUrl.split('/api')[0]}`;
  
  // Adds the indicator to the body when the DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(envIndicator);
  });
}
