// fakeDataGenerator.js - Generate realistic fake data for empty/N/A fields
// This ensures we never send empty required fields to Salesforce

/**
 * Fake Data Generator Service
 * Generates realistic data for empty or N/A fields before Salesforce transfer
 */
class FakeDataGenerator {
    constructor() {
        // First names pool (diverse, realistic)
        this.firstNames = [
            'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
            'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
            'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander', 'Abigail', 'Michael',
            'Emily', 'Daniel', 'Elizabeth', 'Matthew', 'Sofia', 'Aiden', 'Avery',
            'Joseph', 'Ella', 'Samuel', 'Scarlett', 'David', 'Grace', 'Carter',
            'Hannah', 'Owen', 'Lily', 'Dylan', 'Chloe', 'Sebastian', 'Zoe', 'Jack'
        ];

        // Last names pool (realistic German and international names)
        this.lastNames = [
            'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner',
            'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter',
            'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun',
            'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Werner', 'Schmitt', 'Krause',
            'Johnson', 'Smith', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
            'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson'
        ];

        // Company names pool (realistic B2B companies)
        this.companyNames = [
            'TechVision GmbH', 'DataFlow Solutions', 'CloudFirst Systems', 'InnovateLab AG',
            'NextGen Technologies', 'SmartBusiness Group', 'FutureTech Industries', 'Digitalize Pro',
            'SystemWorks GmbH', 'ProActive Solutions', 'Synergy Partners', 'Global Dynamics',
            'Enterprise Connect', 'BlueSky Ventures', 'Prime Solutions AG', 'CoreBusiness Systems',
            'Quantum Technologies', 'Nexus Group', 'Pinnacle Partners', 'Vanguard Solutions',
            'Meridian Systems', 'Catalyst Ventures', 'Horizon Enterprises', 'Summit Group',
            'Apex Technologies', 'Vertex Solutions', 'Matrix Systems', 'Fusion Partners'
        ];

        // Job titles pool
        this.titles = [
            'CEO', 'CTO', 'CFO', 'Managing Director', 'VP of Sales', 'Sales Manager',
            'Business Development Manager', 'Marketing Director', 'Product Manager',
            'Operations Manager', 'IT Director', 'Project Manager', 'Account Executive',
            'Senior Consultant', 'Team Lead', 'Department Head', 'Director'
        ];

        // German cities pool
        this.cities = [
            'Berlin', 'München', 'Hamburg', 'Frankfurt', 'Köln', 'Stuttgart', 'Düsseldorf',
            'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg',
            'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster'
        ];

        // Streets
        this.streets = [
            'Hauptstraße', 'Bahnhofstraße', 'Kirchstraße', 'Gartenstraße', 'Schulstraße',
            'Poststraße', 'Marktplatz', 'Berliner Straße', 'Mühlenweg', 'Lindenstraße'
        ];

        // Industries
        this.industries = [
            'Technology', 'Manufacturing', 'Healthcare', 'Finance', 'Retail',
            'Consulting', 'Education', 'Transportation', 'Real Estate', 'Telecommunications'
        ];

        // Lead sources
        this.leadSources = [
            'Website', 'Trade Show', 'Referral', 'Partner', 'Web Form', 'Email Campaign'
        ];
    }

    /**
     * Check if a value is empty, null, undefined, or "N/A"
     */
    isEmpty(value) {
        if (value === null || value === undefined || value === '') {
            return true;
        }

        const stringValue = String(value).trim();
        return stringValue === '' ||
               stringValue.toUpperCase() === 'N/A' ||
               stringValue.toUpperCase() === 'NA';
    }

    /**
     * Get random item from array
     */
    randomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Generate random number between min and max
     */
    randomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Generate fake first name
     */
    generateFirstName() {
        return this.randomItem(this.firstNames);
    }

    /**
     * Generate fake last name
     */
    generateLastName() {
        return this.randomItem(this.lastNames);
    }

    /**
     * Generate fake email based on name
     */
    generateEmail(firstName, lastName) {
        const domains = ['example.com', 'company.com', 'business.de', 'email.com'];
        const first = firstName.toLowerCase().replace(/[^a-z]/g, '');
        const last = lastName.toLowerCase().replace(/[^a-z]/g, '');
        return `${first}.${last}@${this.randomItem(domains)}`;
    }

    /**
     * Generate fake company name
     */
    generateCompany() {
        return this.randomItem(this.companyNames);
    }

    /**
     * Generate fake phone number (German format)
     */
    generatePhone() {
        const areaCode = this.randomNumber(30, 99);
        const number = this.randomNumber(10000000, 99999999);
        return `+49 ${areaCode} ${number}`;
    }

    /**
     * Generate fake mobile phone (German format)
     */
    generateMobilePhone() {
        const number = this.randomNumber(100000000, 999999999);
        return `+49 15${number}`;
    }

    /**
     * Generate fake job title
     */
    generateTitle() {
        return this.randomItem(this.titles);
    }

    /**
     * Generate fake street address
     */
    generateStreet() {
        const street = this.randomItem(this.streets);
        const number = this.randomNumber(1, 200);
        return `${street} ${number}`;
    }

    /**
     * Generate fake city
     */
    generateCity() {
        return this.randomItem(this.cities);
    }

    /**
     * Generate fake postal code (German format)
     */
    generatePostalCode() {
        return String(this.randomNumber(10000, 99999));
    }

    /**
     * Generate fake state (German)
     */
    generateState() {
        const states = [
            'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
            'Hamburg', 'Hessen', 'Niedersachsen', 'Nordrhein-Westfalen',
            'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
            'Schleswig-Holstein', 'Thüringen'
        ];
        return this.randomItem(states);
    }

    /**
     * Generate fake industry
     */
    generateIndustry() {
        return this.randomItem(this.industries);
    }

    /**
     * Generate fake website
     */
    generateWebsite(companyName) {
        const clean = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 15);
        return `https://www.${clean}.com`;
    }

    /**
     * Generate fake lead source
     */
    generateLeadSource() {
        return this.randomItem(this.leadSources);
    }

    /**
     * Generate fake annual revenue
     */
    generateAnnualRevenue() {
        return this.randomNumber(100000, 10000000);
    }

    /**
     * Generate fake number of employees
     */
    generateNumberOfEmployees() {
        const ranges = [10, 50, 100, 250, 500, 1000, 5000];
        return this.randomItem(ranges);
    }

    /**
     * Generate fake description
     */
    generateDescription() {
        const templates = [
            'Interested in our products and services.',
            'Contacted through website inquiry.',
            'Potential customer for business solutions.',
            'Follow-up required for product demonstration.',
            'Interested in enterprise solutions.'
        ];
        return this.randomItem(templates);
    }

    /**
     * Process lead data and fill empty required fields with fake data
     * @param {Object} leadData - Original lead data
     * @param {Array} requiredFields - Array of required field names
     * @returns {Object} Lead data with fake values for empty required fields
     */
    fillEmptyFields(leadData, requiredFields = ['LastName', 'Company']) {
        const processedData = { ...leadData };
        const filledFields = [];

        // Generate consistent fake person data
        let fakeFirstName = null;
        let fakeLastName = null;
        let fakeCompany = null;

        // Check and fill required fields
        for (const fieldName of requiredFields) {
            if (this.isEmpty(processedData[fieldName])) {
                let fakeValue = null;

                switch (fieldName) {
                    case 'FirstName':
                        fakeFirstName = this.generateFirstName();
                        fakeValue = fakeFirstName;
                        break;

                    case 'LastName':
                        fakeLastName = this.generateLastName();
                        fakeValue = fakeLastName;
                        break;

                    case 'Company':
                        fakeCompany = this.generateCompany();
                        fakeValue = fakeCompany;
                        break;

                    case 'Email':
                        // Generate email based on name if available
                        const firstName = processedData.FirstName || fakeFirstName || this.generateFirstName();
                        const lastName = processedData.LastName || fakeLastName || this.generateLastName();
                        fakeValue = this.generateEmail(firstName, lastName);
                        break;

                    case 'Phone':
                        fakeValue = this.generatePhone();
                        break;

                    case 'MobilePhone':
                        fakeValue = this.generateMobilePhone();
                        break;

                    case 'Title':
                        fakeValue = this.generateTitle();
                        break;

                    case 'Street':
                        fakeValue = this.generateStreet();
                        break;

                    case 'City':
                        fakeValue = this.generateCity();
                        break;

                    case 'PostalCode':
                        fakeValue = this.generatePostalCode();
                        break;

                    case 'State':
                        fakeValue = this.generateState();
                        break;

                    case 'Country':
                        fakeValue = 'Germany';
                        break;

                    case 'Industry':
                        fakeValue = this.generateIndustry();
                        break;

                    case 'Website':
                        const company = processedData.Company || fakeCompany || 'Example Company';
                        fakeValue = this.generateWebsite(company);
                        break;

                    case 'LeadSource':
                        fakeValue = this.generateLeadSource();
                        break;

                    case 'Description':
                        fakeValue = this.generateDescription();
                        break;

                    case 'AnnualRevenue':
                        fakeValue = this.generateAnnualRevenue();
                        break;

                    case 'NumberOfEmployees':
                        fakeValue = this.generateNumberOfEmployees();
                        break;

                    default:
                        // For unknown fields, generate a generic placeholder
                        fakeValue = `Auto-generated value`;
                        break;
                }

                processedData[fieldName] = fakeValue;
                filledFields.push(fieldName);
            }
        }

        if (filledFields.length > 0) {
            console.log(`🎭 Generated fake data for ${filledFields.length} empty fields:`, filledFields);
        }

        return {
            data: processedData,
            filledFields: filledFields,
            hadEmptyFields: filledFields.length > 0
        };
    }

    /**
     * Check if lead data has any empty required fields
     * @param {Object} leadData - Lead data to check
     * @param {Array} requiredFields - Array of required field names
     * @returns {Object} { hasEmpty: boolean, emptyFields: Array }
     */
    checkEmptyFields(leadData, requiredFields = ['LastName', 'Company']) {
        const emptyFields = [];

        for (const fieldName of requiredFields) {
            if (this.isEmpty(leadData[fieldName])) {
                emptyFields.push(fieldName);
            }
        }

        return {
            hasEmpty: emptyFields.length > 0,
            emptyFields: emptyFields
        };
    }
}

// Create singleton instance
const fakeDataGenerator = new FakeDataGenerator();

// Export for use in other modules
window.FakeDataGenerator = FakeDataGenerator;
window.fakeDataGenerator = fakeDataGenerator;

export default fakeDataGenerator;
