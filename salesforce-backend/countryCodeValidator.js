/**
 * Dynamic Country/CountryCode Validation Module
 *
 * This module fetches valid CountryCode picklist values directly from Salesforce
 * instead of using hardcoded values. This ensures compatibility with any
 * Salesforce org configuration.
 */

const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL

// Cache for CountryCode picklist values
let countryCodePicklistCache = null;
let countryCodePicklistCacheTimestamp = 0;

/**
 * Fetch valid CountryCode picklist values dynamically from Salesforce
 * @param {Object} conn - JSForce connection object
 * @returns {Promise<Object>} Object with codes array and countryMap
 */
async function fetchValidCountryCodes(conn) {
    const now = Date.now();

    // Return cached values if still valid (1 hour TTL)
    if (countryCodePicklistCache && (now - countryCodePicklistCacheTimestamp) < CACHE_TTL) {
        console.log(`🔄 Using cached CountryCode values (${countryCodePicklistCache.codes.length} codes, ${countryCodePicklistCache.countryMap.size} country mappings)`);
        return countryCodePicklistCache;
    }

    try {
        console.log('🌍 Fetching CountryCode picklist values from Salesforce...');
        const metadata = await conn.describe('Lead');

        console.log("metadata", metadata);

        // Find CountryCode field
        const countryCodeField = metadata.fields.find(f => f.name === 'CountryCode');

        if (!countryCodeField || !countryCodeField.picklistValues) {
            console.warn('⚠️ CountryCode field not found or has no picklist values - using fallback');
            return getFallbackCountryCodes();
        }

        // Extract valid values from picklist
        const validCodes = countryCodeField.picklistValues
            .filter(pv => pv.active)
            .map(pv => pv.value);

        console.log(`✅ Fetched ${validCodes.length} valid CountryCode values from Salesforce`);
        console.log(`📋 Valid codes: ${validCodes.slice(0, 10).join(', ')}${validCodes.length > 10 ? '...' : ''}`);

        // Try to build Country name mapping by checking if Country field exists
        const countryField = metadata.fields.find(f => f.name === 'Country');
        const countryMap = new Map();

        if (countryField && countryField.picklistValues) {
            console.log('🗺️ Building Country/CountryCode mapping...');

            // Salesforce typically has matching picklists for Country and CountryCode
            // We'll create a basic mapping based on common patterns
            countryField.picklistValues
                .filter(pv => pv.active)
                .forEach(pv => {
                    const countryName = pv.value;

                    // Try to find matching country code
                    // Common patterns: "Germany" → "DE", "United States" → "US"
                    const possibleCode = findCountryCode(countryName, validCodes);
                    if (possibleCode) {
                        if (!countryMap.has(possibleCode)) {
                            countryMap.set(possibleCode, []);
                        }
                        countryMap.get(possibleCode).push(countryName);
                    }
                });

            console.log(`✅ Built mapping for ${countryMap.size} country codes`);
        }

        // Cache the results
        countryCodePicklistCache = {
            codes: validCodes,
            countryMap: countryMap
        };
        countryCodePicklistCacheTimestamp = now;

        return countryCodePicklistCache;

    } catch (error) {
        console.error('❌ Failed to fetch CountryCode picklist values:', error);
        return getFallbackCountryCodes();
    }
}

/**
 * Helper function to find matching country code from country name
 * @param {string} countryName - Country name from Salesforce
 * @param {Array<string>} validCodes - Array of valid ISO codes
 * @returns {string|null} Matching ISO code or null
 */
function findCountryCode(countryName, validCodes) {
    const countryToCode = {
        'Germany': 'DE', 'Deutschland': 'DE',
        'France': 'FR',
        'United Kingdom': 'GB', 'UK': 'GB', 'Great Britain': 'GB',
        'United States': 'US', 'USA': 'US', 'America': 'US',
        'Canada': 'CA',
        'Switzerland': 'CH', 'Schweiz': 'CH',
        'Austria': 'AT', 'Österreich': 'AT',
        'Italy': 'IT', 'Italia': 'IT',
        'Spain': 'ES', 'España': 'ES',
        'Netherlands': 'NL',
        'Belgium': 'BE', 'Belgique': 'BE',
        'Sweden': 'SE', 'Sverige': 'SE',
        'Denmark': 'DK', 'Danmark': 'DK',
        'Norway': 'NO', 'Norge': 'NO',
        'Finland': 'FI', 'Suomi': 'FI',
        'Poland': 'PL', 'Polska': 'PL',
        'Czech Republic': 'CZ', 'Czechia': 'CZ',
        'Portugal': 'PT',
        'Ireland': 'IE',
        'Greece': 'GR',
        'Luxembourg': 'LU',
        'Japan': 'JP',
        'China': 'CN',
        'India': 'IN',
        'Brazil': 'BR', 'Brasil': 'BR',
        'Mexico': 'MX', 'México': 'MX',
        'Argentina': 'AR',
        'Australia': 'AU',
    };

    const code = countryToCode[countryName];
    return code && validCodes.includes(code) ? code : null;
}

/**
 * Fallback country codes if Salesforce metadata fetch fails
 * @returns {Object} Object with codes array and countryMap
 */
function getFallbackCountryCodes() {
    console.log('⚠️ Using fallback country codes');
    const fallbackCodes = ['DE', 'FR', 'GB', 'US', 'CA', 'AU', 'CH', 'AT', 'IT', 'ES', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI', 'PL', 'CZ', 'PT', 'IE', 'GR', 'LU', 'JP', 'CN', 'IN', 'BR', 'MX', 'AR'];

    const fallbackMap = new Map([
        ['DE', ['Germany', 'Deutschland']],
        ['FR', ['France']],
        ['GB', ['United Kingdom', 'UK', 'Great Britain']],
        ['US', ['United States', 'USA', 'America']],
        ['CA', ['Canada']],
        ['CH', ['Switzerland', 'Schweiz']],
        ['AT', ['Austria', 'Österreich']],
    ]);

    return {
        codes: fallbackCodes,
        countryMap: fallbackMap
    };
}

/**
 * Validate and fix Country/CountryCode fields
 * @param {Object} leadData - Lead data object to validate
 * @param {Object} conn - JSForce connection object
 * @returns {Promise<Object>} Updated lead data with validated country fields
 */
async function validateCountryFields(leadData, conn) {
    // Fetch valid country codes from Salesforce
    const { codes: validCountryCodes, countryMap } = await fetchValidCountryCodes(conn);

    // Validate CountryCode
    if (leadData.CountryCode) {
        const code = leadData.CountryCode.toUpperCase().substring(0, 2);
        if (!validCountryCodes.includes(code)) {
            console.log(`⚠️ Invalid CountryCode removed: ${leadData.CountryCode}`);
            delete leadData.CountryCode;
        } else {
            leadData.CountryCode = code;
        }
    }

    // If Country field has been modified (e.g., "Germany1"), clean it
    if (leadData.Country) {
        // Remove numbers and extra characters from country name
        const cleanCountry = leadData.Country.replace(/[0-9]+/g, '').trim();
        if (cleanCountry !== leadData.Country) {
            console.log(`⚠️ Cleaned Country field: "${leadData.Country}" → "${cleanCountry}"`);
            leadData.Country = cleanCountry;
        }
    }

    // If CountryCode exists but Country doesn't match, remove CountryCode to avoid mismatch
    if (leadData.CountryCode && leadData.Country) {
        const expectedCountries = countryMap.get(leadData.CountryCode) || [];
        const countryMatches = expectedCountries.some(c =>
            leadData.Country.toLowerCase().includes(c.toLowerCase())
        );

        if (!countryMatches) {
            console.log(`⚠️ Country/CountryCode mismatch - removing CountryCode: ${leadData.Country} / ${leadData.CountryCode}`);
            delete leadData.CountryCode;
        }
    }

    return leadData;
}

module.exports = {
    fetchValidCountryCodes,
    validateCountryFields,
    getFallbackCountryCodes
};
