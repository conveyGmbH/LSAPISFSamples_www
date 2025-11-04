/**
 * DEBUG ENDPOINTS - Salesforce Metadata Inspection
 *
 * These endpoints allow you to inspect Salesforce metadata via Postman/Browser
 * Useful for understanding what conn.describe('Lead') returns
 */

module.exports = function(app, getCurrentOrgId, getConnection) {

    // DEBUG ENDPOINT: Get Lead object metadata (FULL)
    app.get('/api/salesforce/metadata/lead', async (req, res) => {
        try {
            const orgId = getCurrentOrgId(req);
            const conn = getConnection(orgId);

            if (!conn) {
                return res.status(401).json({
                    message: 'Not connected to Salesforce',
                    tip: 'Please connect to Salesforce first via the UI at http://localhost:3000/displayLeadTransfer'
                });
            }

            console.log('🔍 Fetching Lead object metadata...');
            const metadata = await conn.describe('Lead');

            // Return full metadata
            res.json({
                success: true,
                objectName: metadata.name,
                label: metadata.label,
                labelPlural: metadata.labelPlural,
                totalFields: metadata.fields.length,
                recordTypeInfos: metadata.recordTypeInfos,

                // All fields with detailed info
                fields: metadata.fields.map(f => ({
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    length: f.length,
                    updateable: f.updateable,
                    createable: f.createable,
                    picklistValues: f.picklistValues ? f.picklistValues.map(pv => ({
                        value: pv.value,
                        label: pv.label,
                        active: pv.active,
                        defaultValue: pv.defaultValue
                    })) : null,
                    referenceTo: f.referenceTo,
                    relationshipName: f.relationshipName,
                    custom: f.custom,
                    defaultValue: f.defaultValue
                })),

                // Specific CountryCode field info
                countryCodeField: metadata.fields.find(f => f.name === 'CountryCode'),

                // Specific Country field info
                countryField: metadata.fields.find(f => f.name === 'Country')
            });

        } catch (error) {
            console.error('❌ Failed to fetch Lead metadata:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch Lead metadata',
                error: error.message
            });
        }
    });

    // DEBUG ENDPOINT: Get CountryCode picklist values (FOCUSED VIEW)
    app.get('/api/salesforce/metadata/countrycodes', async (req, res) => {
        try {
            const orgId = getCurrentOrgId(req);
            const conn = getConnection(orgId);

            if (!conn) {
                return res.status(401).json({
                    message: 'Not connected to Salesforce',
                    tip: 'Please connect to Salesforce first via the UI at http://localhost:3000/displayLeadTransfer'
                });
            }

            console.log('🌍 Fetching CountryCode picklist values...');
            const metadata = await conn.describe('Lead');

            // Find CountryCode and Country fields
            const countryCodeField = metadata.fields.find(f => f.name === 'CountryCode');
            const countryField = metadata.fields.find(f => f.name === 'Country');

            if (!countryCodeField) {
                return res.json({
                    success: false,
                    message: 'CountryCode field not found in Lead object',
                    tip: 'Your Salesforce org may not have standard address fields enabled'
                });
            }

            // Extract picklist values
            const countryCodes = countryCodeField.picklistValues || [];
            const countries = countryField ? (countryField.picklistValues || []) : [];

            // Build mapping (like the validator does)
            const countryCodeMap = new Map();
            countries.filter(pv => pv.active).forEach(pv => {
                const countryName = pv.value;
                // Simple heuristic: try to match first 2 letters
                const possibleCode = countryCodes.find(cc =>
                    countryName.toLowerCase().includes(cc.value.toLowerCase()) ||
                    cc.label.toLowerCase().includes(countryName.toLowerCase())
                );

                if (possibleCode) {
                    if (!countryCodeMap.has(possibleCode.value)) {
                        countryCodeMap.set(possibleCode.value, []);
                    }
                    countryCodeMap.get(possibleCode.value).push(countryName);
                }
            });

            res.json({
                success: true,
                countryCode: {
                    fieldName: countryCodeField.name,
                    label: countryCodeField.label,
                    type: countryCodeField.type,
                    totalValues: countryCodes.length,
                    activeValues: countryCodes.filter(pv => pv.active).length,
                    inactiveValues: countryCodes.filter(pv => !pv.active).length,
                    values: countryCodes.map(pv => ({
                        value: pv.value,
                        label: pv.label,
                        active: pv.active
                    }))
                },
                country: countryField ? {
                    fieldName: countryField.name,
                    label: countryField.label,
                    type: countryField.type,
                    totalValues: countries.length,
                    activeValues: countries.filter(pv => pv.active).length,
                    inactiveValues: countries.filter(pv => !pv.active).length,
                    values: countries.map(pv => ({
                        value: pv.value,
                        label: pv.label,
                        active: pv.active
                    }))
                } : null,
                mapping: {
                    description: 'Automatic Country → CountryCode mapping',
                    totalMappings: countryCodeMap.size,
                    mappings: Object.fromEntries(countryCodeMap)
                },
                summary: {
                    totalActiveCountryCodes: countryCodes.filter(pv => pv.active).length,
                    totalActiveCountryNames: countries.filter(pv => pv.active).length,
                    sampleActiveCodes: countryCodes.filter(pv => pv.active).slice(0, 10).map(pv => pv.value).join(', '),
                    sampleInactiveCodes: countryCodes.filter(pv => !pv.active).slice(0, 5).map(pv => pv.value).join(', ')
                }
            });

        } catch (error) {
            console.error('❌ Failed to fetch CountryCode metadata:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch CountryCode metadata',
                error: error.message
            });
        }
    });

    // DEBUG ENDPOINT: Test country validation
    app.post('/api/salesforce/metadata/test-country-validation', async (req, res) => {
        try {
            const orgId = getCurrentOrgId(req);
            const conn = getConnection(orgId);

            if (!conn) {
                return res.status(401).json({
                    message: 'Not connected to Salesforce'
                });
            }

            const { CountryCode, Country } = req.body;

            if (!CountryCode && !Country) {
                return res.status(400).json({
                    message: 'Please provide CountryCode and/or Country in request body',
                    example: { CountryCode: 'DE1', Country: 'Germany1' }
                });
            }

            // Use the actual validator
            const { validateCountryFields } = require('./countryCodeValidator');

            const testData = { CountryCode, Country };
            console.log('🧪 Testing validation with:', testData);

            const result = await validateCountryFields(testData, conn);

            res.json({
                success: true,
                input: { CountryCode, Country },
                output: result,
                changes: {
                    countryCodeChanged: CountryCode !== result.CountryCode,
                    countryChanged: Country !== result.Country,
                    countryCodeRemoved: CountryCode && !result.CountryCode,
                    countryRemoved: Country && !result.Country
                }
            });

        } catch (error) {
            console.error('❌ Validation test failed:', error);
            res.status(500).json({
                success: false,
                message: 'Validation test failed',
                error: error.message
            });
        }
    });

    console.log('✅ Debug endpoints loaded:');
    console.log('   GET  /api/salesforce/metadata/lead - Full Lead object metadata');
    console.log('   GET  /api/salesforce/metadata/countrycodes - CountryCode picklist values');
    console.log('   POST /api/salesforce/metadata/test-country-validation - Test validation');
};
