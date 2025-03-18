// js/config/salesforceConfig.js
const salesforceConfig = {
    clientId: '3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl',
    clientSecret: 'D63BDD0A7C0DD06A57DAE136320DD52317D99F54FF9DB8867257ADC420F356AD',
    redirectUri: 'http://localhost:3000/api/oauth2/callback',
    loginUrl: 'https://login.salesforce.com', 
    version: 'v57.0'
  };
  
  // Exportez la configuration pour l'utiliser dans d'autres fichiers
  export default salesforceConfig;