export const appConfig = {
  // Automatic detection of the environment
  isProduction: window.location.hostname !== 'localhost' && 
                window.location.hostname !== '127.0.0.1',
  
  // Environment-specific configuration
  get apiBaseUrl() {
    return this.isProduction
      ? 'https://lsapisamplesbackend-bhesadgtbja4dmgq.germanywestcentral-01.azurewebsites.net/api' // Base URL for production
      : 'http://localhost:3000/api'; // Base URL for development
  },
  
  // Add other settings as needed
  get environmentName() {
    return this.isProduction ? 'production' : 'development'; // Returns the current environment name
  }
};

// Logs to the console for debugging purposes
console.log(`Application running in ${appConfig.environmentName} mode`);
console.log(`API Base URL: ${appConfig.apiBaseUrl}`);
