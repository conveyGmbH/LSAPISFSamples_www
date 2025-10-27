#!/usr/bin/env node
/**
 * Query Last 10 Leads from Salesforce
 *
 * Usage:
 * node query-leads.js <accessToken> <instanceUrl>
 *
 * Or set environment variables:
 * SF_ACCESS_TOKEN=your_token SF_INSTANCE_URL=your_url node query-leads.js
 */

const jsforce = require('jsforce');

// Get credentials from arguments or environment variables
const accessToken = process.argv[2] || process.env.SF_ACCESS_TOKEN;
const instanceUrl = process.argv[3] || process.env.SF_INSTANCE_URL;

if (!accessToken || !instanceUrl) {
    console.error('❌ Error: Missing credentials!');
    console.error('');
    console.error('Usage:');
    console.error('  node query-leads.js <accessToken> <instanceUrl>');
    console.error('');
    console.error('Or set environment variables:');
    console.error('  SF_ACCESS_TOKEN=your_token SF_INSTANCE_URL=your_url node query-leads.js');
    console.error('');
    console.error('You can get these from:');
    console.error('  1. Authenticate via the web app at http://localhost:3000/auth/salesforce');
    console.error('  2. Or use the /api/salesforce/check endpoint after authentication');
    process.exit(1);
}

console.log('🔌 Connecting to Salesforce...');
console.log('   Instance:', instanceUrl);
console.log('   Token:', accessToken.substring(0, 20) + '...');
console.log('');

// Create connection
const conn = new jsforce.Connection({
    instanceUrl: instanceUrl,
    accessToken: accessToken,
    version: '62.0'
});

// SOQL Query
const query = `
    SELECT Id, FirstName, LastName, Company, Email, CreatedDate
    FROM Lead
    ORDER BY CreatedDate DESC
    LIMIT 10
`;

console.log('📊 Executing SOQL Query:');
console.log(query.trim());
console.log('');

// Execute query
conn.query(query)
    .then(result => {
        console.log('✅ Query Successful!');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`📋 LAST 10 LEADS (Total found: ${result.totalSize})`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');

        if (result.records.length === 0) {
            console.log('ℹ️  No leads found in Salesforce.');
        } else {
            result.records.forEach((lead, index) => {
                console.log(`${index + 1}. Lead ID: ${lead.Id}`);
                console.log(`   Name: ${lead.FirstName || ''} ${lead.LastName || 'N/A'}`.trim());
                console.log(`   Company: ${lead.Company || 'N/A'}`);
                console.log(`   Email: ${lead.Email || 'N/A'}`);
                console.log(`   Created: ${lead.CreatedDate ? new Date(lead.CreatedDate).toLocaleString() : 'N/A'}`);
                console.log('');
            });
        }

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');

        // Also output as JSON for programmatic use
        console.log('📄 JSON Output:');
        console.log(JSON.stringify(result.records, null, 2));

    })
    .catch(error => {
        console.error('');
        console.error('❌ Query Failed!');
        console.error('Error:', error.message);
        console.error('');
        if (error.errorCode) {
            console.error('Error Code:', error.errorCode);
        }
        if (error.name === 'ERROR_HTTP_401') {
            console.error('');
            console.error('⚠️  Authentication error! Your access token may be expired.');
            console.error('   Please re-authenticate and get a new access token.');
        }
        process.exit(1);
    });