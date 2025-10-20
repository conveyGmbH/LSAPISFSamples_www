// FieldMappingTemplates.js
// Service to manage reusable field mapping templates for events

class FieldMappingTemplates {
    constructor(fieldMappingService) {
        this.fieldMappingService = fieldMappingService;
        this.templates = this.loadTemplates();
    }

    /**
     * Load all saved templates from localStorage
     */
    loadTemplates() {
        try {
            const saved = localStorage.getItem('fieldMappingTemplates');
            return saved ? JSON.parse(saved) : {
                templates: [],
                lastModified: new Date().toISOString()
            };
        } catch (error) {
            console.error('Failed to load templates:', error);
            return { templates: [], lastModified: new Date().toISOString() };
        }
    }

    /**
     * Save templates to localStorage
     */
    saveTemplates() {
        try {
            this.templates.lastModified = new Date().toISOString();
            localStorage.setItem('fieldMappingTemplates', JSON.stringify(this.templates));
            console.log('✅ Templates saved successfully');
            return true;
        } catch (error) {
            console.error('Failed to save templates:', error);
            return false;
        }
    }

    /**
     * Create a new template from current field mappings
     * @param {string} templateName - Name for the template
     * @param {string} description - Description of what this template is for
     * @param {Array<string>} categories - Categories for filtering (e.g., ["Trade Show", "Webinar"])
     */
    createTemplate(templateName, description = '', categories = []) {
        // Get current field configuration
        const currentConfig = this.fieldMappingService.exportConfiguration();

        const template = {
            id: this.generateTemplateId(),
            name: templateName,
            description: description,
            categories: categories,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            fieldMappings: currentConfig.customLabels,
            fieldConfig: currentConfig.fieldMapping.config,
            metadata: {
                totalFields: currentConfig.metadata.totalFields,
                activeFields: currentConfig.metadata.activeFields,
                customLabelsCount: currentConfig.metadata.customLabelsCount
            }
        };

        this.templates.templates.push(template);
        this.saveTemplates();

        console.log(`✅ Template "${templateName}" created with ${template.metadata.customLabelsCount} field mappings`);
        return template;
    }

    /**
     * Apply a template to current event
     * @param {string} templateId - ID of template to apply
     * @param {boolean} overwrite - Whether to overwrite existing mappings
     */
    async applyTemplate(templateId, overwrite = false) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        console.log(`📥 Applying template: ${template.name}`);

        // Apply field mappings
        let appliedCount = 0;
        let skippedCount = 0;

        for (const [fieldName, customLabel] of Object.entries(template.fieldMappings)) {
            // Check if field already has a custom label
            const existingLabel = this.fieldMappingService.customLabels[fieldName];

            if (existingLabel && !overwrite) {
                console.log(`⏭️  Skipping ${fieldName} (already has label: ${existingLabel})`);
                skippedCount++;
                continue;
            }

            // Apply the custom label
            await this.fieldMappingService.setCustomLabel(fieldName, customLabel);
            appliedCount++;
        }

        // Apply field active/inactive states
        if (template.fieldConfig && template.fieldConfig.fields) {
            for (const field of template.fieldConfig.fields) {
                await this.fieldMappingService.setFieldConfig(field.fieldName, {
                    active: field.active !== false
                });
            }
        }

        console.log(`✅ Template applied: ${appliedCount} fields mapped, ${skippedCount} skipped`);
        return { appliedCount, skippedCount };
    }

    /**
     * Get a specific template by ID
     */
    getTemplate(templateId) {
        return this.templates.templates.find(t => t.id === templateId);
    }

    /**
     * Get all templates
     */
    getAllTemplates() {
        return this.templates.templates;
    }

    /**
     * Get templates by category
     */
    getTemplatesByCategory(category) {
        return this.templates.templates.filter(t =>
            t.categories && t.categories.includes(category)
        );
    }

    /**
     * Update an existing template
     */
    updateTemplate(templateId, updates) {
        const index = this.templates.templates.findIndex(t => t.id === templateId);
        if (index === -1) {
            throw new Error(`Template ${templateId} not found`);
        }

        this.templates.templates[index] = {
            ...this.templates.templates[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.saveTemplates();
        console.log(`✅ Template "${this.templates.templates[index].name}" updated`);
        return this.templates.templates[index];
    }

    /**
     * Delete a template
     */
    deleteTemplate(templateId) {
        const index = this.templates.templates.findIndex(t => t.id === templateId);
        if (index === -1) {
            throw new Error(`Template ${templateId} not found`);
        }

        const deleted = this.templates.templates.splice(index, 1)[0];
        this.saveTemplates();
        console.log(`✅ Template "${deleted.name}" deleted`);
        return deleted;
    }

    /**
     * Export template to JSON file
     */
    exportTemplateToFile(templateId) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        const json = JSON.stringify(template, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `field-mapping-template-${template.name.replace(/\s+/g, '-').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`✅ Template "${template.name}" exported to file`);
    }

    /**
     * Import template from JSON file
     */
    async importTemplateFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const template = JSON.parse(e.target.result);

                    // Validate template structure
                    if (!template.name || !template.fieldMappings) {
                        throw new Error('Invalid template format');
                    }

                    // Generate new ID to avoid conflicts
                    template.id = this.generateTemplateId();
                    template.importedAt = new Date().toISOString();

                    this.templates.templates.push(template);
                    this.saveTemplates();

                    console.log(`✅ Template "${template.name}" imported successfully`);
                    resolve(template);
                } catch (error) {
                    console.error('Failed to import template:', error);
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Create a sample template for common use cases
     */
    createSampleTemplate(type = 'tradeshow') {
        const samples = {
            tradeshow: {
                name: 'Trade Show Event Template',
                description: 'Standard field mappings for trade show lead capture',
                categories: ['Trade Show', 'Events'],
                fieldMappings: {
                    'Question01': 'Products_Interest__c',
                    'Answers01': 'Products_Answer__c',
                    'Text01': 'Products_Notes__c',

                    'Question02': 'Prospects_Level__c',
                    'Answers02': 'Prospects_Answer__c',
                    'Text02': 'Prospects_Notes__c',

                    'Question03': 'Priority__c',
                    'Answers03': 'Priority_Answer__c',
                    'Text03': 'Priority_Notes__c',

                    'Question04': 'Contact_Preference__c',
                    'Answers04': 'Contact_Answer__c',
                    'Text04': 'Contact_Notes__c',

                    'Question05': 'Followup_Timeline__c',
                    'Answers05': 'Followup_Answer__c',
                    'Text05': 'Followup_Notes__c',

                    'SalesArea': 'Sales_Region__c',
                    'Department': 'Department__c',
                    'Industry': 'Industry__c'
                }
            },
            webinar: {
                name: 'Webinar Registration Template',
                description: 'Field mappings for webinar attendee data',
                categories: ['Webinar', 'Online Events'],
                fieldMappings: {
                    'Question01': 'Webinar_Topic_Interest__c',
                    'Answers01': 'Topic_Answer__c',
                    'Text01': 'Topic_Notes__c',

                    'Question02': 'Company_Size__c',
                    'Answers02': 'Company_Size_Answer__c',
                    'Text02': 'Company_Size_Notes__c',

                    'Question03': 'Role__c',
                    'Answers03': 'Role_Answer__c',
                    'Text03': 'Role_Notes__c',

                    'Question04': 'Pain_Points__c',
                    'Answers04': 'Pain_Points_Answer__c',
                    'Text04': 'Pain_Points_Notes__c',

                    'Industry': 'Industry__c',
                    'Department': 'Department__c'
                }
            },
            survey: {
                name: 'Customer Survey Template',
                description: 'Field mappings for customer feedback surveys',
                categories: ['Survey', 'Feedback'],
                fieldMappings: {
                    'Question01': 'Satisfaction_Score__c',
                    'Answers01': 'Satisfaction_Answer__c',
                    'Text01': 'Satisfaction_Comments__c',

                    'Question02': 'Product_Feedback__c',
                    'Answers02': 'Product_Answer__c',
                    'Text02': 'Product_Comments__c',

                    'Question03': 'Support_Rating__c',
                    'Answers03': 'Support_Answer__c',
                    'Text03': 'Support_Comments__c',

                    'Question04': 'Recommendation_Likelihood__c',
                    'Answers04': 'NPS_Score__c',
                    'Text04': 'NPS_Comments__c',

                    'Question05': 'Improvement_Suggestions__c',
                    'Answers05': 'Improvement_Answer__c',
                    'Text05': 'Improvement_Details__c'
                }
            }
        };

        const sample = samples[type];
        if (!sample) {
            throw new Error(`Unknown sample type: ${type}`);
        }

        return this.createTemplateFromData(sample);
    }

    /**
     * Create template from provided data
     */
    createTemplateFromData(templateData) {
        const template = {
            id: this.generateTemplateId(),
            name: templateData.name,
            description: templateData.description || '',
            categories: templateData.categories || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            fieldMappings: templateData.fieldMappings,
            metadata: {
                totalFields: Object.keys(templateData.fieldMappings).length,
                customLabelsCount: Object.keys(templateData.fieldMappings).length
            }
        };

        this.templates.templates.push(template);
        this.saveTemplates();

        console.log(`✅ Template "${template.name}" created from data`);
        return template;
    }

    /**
     * Generate unique template ID
     */
    generateTemplateId() {
        return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Preview what would change if template is applied
     */
    previewTemplate(templateId) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        const preview = {
            templateName: template.name,
            changes: [],
            newFields: [],
            overwrites: []
        };

        for (const [fieldName, newLabel] of Object.entries(template.fieldMappings)) {
            const existingLabel = this.fieldMappingService.customLabels[fieldName];

            if (!existingLabel) {
                preview.newFields.push({
                    field: fieldName,
                    label: newLabel
                });
            } else if (existingLabel !== newLabel) {
                preview.overwrites.push({
                    field: fieldName,
                    currentLabel: existingLabel,
                    newLabel: newLabel
                });
            }
        }

        preview.changes = [...preview.newFields, ...preview.overwrites];
        return preview;
    }
}

// Make available globally
window.FieldMappingTemplates = FieldMappingTemplates;
