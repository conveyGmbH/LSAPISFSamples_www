export const appConfig = {
  // Automatic detection of the environment
  isProduction: window.location.hostname !== 'localhost' && 
                window.location.hostname !== '127.0.0.1',
  
  // Environment-specific configuration
  get apiBaseUrl() {
    return 'https://lsapisfbackend.convey.de/api'
    
  },
  
  // Add other settings as needed
  get environmentName() {
    return this.isProduction ? 'production' : 'development'; 
  }
};

// Logs to the console for debugging purposes
console.log(`Application running in ${appConfig.environmentName} mode`);
console.log(`API Base URL: ${appConfig.apiBaseUrl}`);
