#!/usr/bin/env node

/**
 * Salesforce MCP Server
 * Custom MCP server that exposes Salesforce functionality from the existing backend
 * Uses the Model Context Protocol (MCP) to allow AI assistants to interact with Salesforce
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// Import your existing backend services
const jsforce = require('jsforce');
const fieldConfigStorage = require('./fieldConfigStorage');
const { transferLeadWithAutoFieldCreation } = require('./leadTransferService');

// Store connections per org
const connections = new Map();
let currentOrgId = null;

/**
 * Get or create a Salesforce connection
 */
function getConnection(orgId, accessToken, instanceUrl) {
  if (!connections.has(orgId)) {
    const conn = new jsforce.Connection({
      instanceUrl: instanceUrl,
      accessToken: accessToken,
      version: '62.0'
    });
    connections.set(orgId, conn);
  }
  return connections.get(orgId);
}

/**
 * Initialize MCP Server
 */
class SalesforceMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'salesforce-lsapi-crm',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'sf_connect',
          description: 'Connect to a Salesforce org using OAuth credentials',
          inputSchema: {
            type: 'object',
            properties: {
              accessToken: {
                type: 'string',
                description: 'Salesforce access token from OAuth flow',
              },
              instanceUrl: {
                type: 'string',
                description: 'Salesforce instance URL (e.g., https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com)',
              },
              orgId: {
                type: 'string',
                description: 'Salesforce organization ID (optional, will be fetched if not provided)',
              },
            },
            required: ['accessToken', 'instanceUrl'],
          },
        },
        {
          name: 'sf_get_active_fields',
          description: 'Get the list of active custom fields configured for the current Salesforce org',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'sf_set_active_fields',
          description: 'Set which custom fields (Question/Answers/Text) are active for lead transfers',
          inputSchema: {
            type: 'object',
            properties: {
              activeFields: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of field names to activate (e.g., ["Question01", "Answers01", "Text01"])',
              },
              customLabels: {
                type: 'object',
                description: 'Optional custom labels for fields',
              },
            },
            required: ['activeFields'],
          },
        },
        {
          name: 'sf_check_fields',
          description: 'Check which custom fields exist in Salesforce and which need to be created',
          inputSchema: {
            type: 'object',
            properties: {
              fieldNames: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of field names to check (e.g., ["Question01__c", "Answers01__c"])',
              },
            },
            required: ['fieldNames'],
          },
        },
        {
          name: 'sf_create_fields',
          description: 'Create missing custom fields in Salesforce',
          inputSchema: {
            type: 'object',
            properties: {
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    apiName: { type: 'string' },
                    label: { type: 'string' },
                  },
                },
                description: 'Array of fields to create with apiName and label',
              },
            },
            required: ['fields'],
          },
        },
        {
          name: 'sf_transfer_lead',
          description: 'Transfer a lead to Salesforce with automatic field creation',
          inputSchema: {
            type: 'object',
            properties: {
              leadData: {
                type: 'object',
                description: 'Lead data object with standard and custom fields',
              },
              attachments: {
                type: 'array',
                items: { type: 'object' },
                description: 'Optional array of attachments',
              },
            },
            required: ['leadData'],
          },
        },
        {
          name: 'sf_query',
          description: 'Execute a SOQL query on Salesforce',
          inputSchema: {
            type: 'object',
            properties: {
              soql: {
                type: 'string',
                description: 'SOQL query string (e.g., "SELECT Id, Name FROM Lead LIMIT 10")',
              },
            },
            required: ['soql'],
          },
        },
        {
          name: 'sf_get_user_info',
          description: 'Get information about the currently authenticated Salesforce user',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'sf_connect':
            return await this.handleConnect(args);

          case 'sf_get_active_fields':
            return await this.handleGetActiveFields();

          case 'sf_set_active_fields':
            return await this.handleSetActiveFields(args);

          case 'sf_check_fields':
            return await this.handleCheckFields(args);

          case 'sf_create_fields':
            return await this.handleCreateFields(args);

          case 'sf_transfer_lead':
            return await this.handleTransferLead(args);

          case 'sf_query':
            return await this.handleQuery(args);

          case 'sf_get_user_info':
            return await this.handleGetUserInfo();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}\n\nStack: ${error.stack}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async handleConnect(args) {
    const { accessToken, instanceUrl, orgId } = args;

    const conn = new jsforce.Connection({
      instanceUrl,
      accessToken,
      version: '62.0'
    });

    // Get user info to verify connection and get orgId
    const userInfo = await conn.identity();
    currentOrgId = orgId || userInfo.organization_id;

    connections.set(currentOrgId, conn);

    // Initialize field config storage
    await fieldConfigStorage.initializeStorage();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            orgId: currentOrgId,
            username: userInfo.username,
            displayName: userInfo.display_name,
            organizationId: userInfo.organization_id,
            message: 'Successfully connected to Salesforce',
          }, null, 2),
        },
      ],
    };
  }

  async handleGetActiveFields() {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const config = fieldConfigStorage.getFieldConfig(currentOrgId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            orgId: currentOrgId,
            activeFields: config.activeFields || [],
            customLabels: config.customLabels || {},
            lastUpdated: config.lastUpdated,
          }, null, 2),
        },
      ],
    };
  }

  async handleSetActiveFields(args) {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const { activeFields, customLabels = {} } = args;

    const config = await fieldConfigStorage.setFieldConfig(
      currentOrgId,
      activeFields,
      customLabels
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            orgId: currentOrgId,
            activeFields: config.activeFields,
            message: `Activated ${activeFields.length} fields`,
          }, null, 2),
        },
      ],
    };
  }

  async handleCheckFields(args) {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const conn = connections.get(currentOrgId);
    if (!conn) {
      throw new Error('Connection lost. Please reconnect using sf_connect.');
    }

    const { fieldNames } = args;

    // Query existing fields
    const fieldQuery = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Lead' AND QualifiedApiName IN (${fieldNames.map(f => `'${f}'`).join(',')})`;

    const result = await conn.query(fieldQuery);
    const existingFields = result.records.map(r => r.QualifiedApiName);
    const missingFields = fieldNames.filter(f => !existingFields.includes(f));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            existing: existingFields,
            missing: missingFields,
            totalChecked: fieldNames.length,
          }, null, 2),
        },
      ],
    };
  }

  async handleCreateFields(args) {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const conn = connections.get(currentOrgId);
    if (!conn) {
      throw new Error('Connection lost. Please reconnect using sf_connect.');
    }

    const { fields } = args;
    const results = { created: [], failed: [], skipped: [] };

    for (const field of fields) {
      try {
        const metadata = {
          fullName: `Lead.${field.apiName}`,
          label: field.label,
          type: 'Text',
          length: 255,
        };

        await conn.metadata.create('CustomField', metadata);
        results.created.push(field.apiName);
      } catch (error) {
        if (error.message.includes('duplicate')) {
          results.skipped.push(field.apiName);
        } else {
          results.failed.push({ field: field.apiName, error: error.message });
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async handleTransferLead(args) {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const conn = connections.get(currentOrgId);
    if (!conn) {
      throw new Error('Connection lost. Please reconnect using sf_connect.');
    }

    const { leadData, attachments = [] } = args;

    // Get active fields for this org
    const activeFields = fieldConfigStorage.getActiveFields(currentOrgId);

    // Use the existing lead transfer service
    const result = await transferLeadWithAutoFieldCreation(
      conn,
      leadData,
      activeFields,
      attachments
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async handleQuery(args) {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const conn = connections.get(currentOrgId);
    if (!conn) {
      throw new Error('Connection lost. Please reconnect using sf_connect.');
    }

    const { soql } = args;
    const result = await conn.query(soql);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalSize: result.totalSize,
            done: result.done,
            records: result.records,
          }, null, 2),
        },
      ],
    };
  }

  async handleGetUserInfo() {
    if (!currentOrgId) {
      throw new Error('Not connected to Salesforce. Use sf_connect first.');
    }

    const conn = connections.get(currentOrgId);
    if (!conn) {
      throw new Error('Connection lost. Please reconnect using sf_connect.');
    }

    const userInfo = await conn.identity();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(userInfo, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Salesforce MCP Server running on stdio');
  }
}

// Start the server
const server = new SalesforceMCPServer();
server.run().catch(console.error);
