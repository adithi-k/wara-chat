const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { ManagedIdentityCredential } = require('@azure/identity');
const { ResourceGraphClient } = require("@azure/arm-resourcegraph");
const { SecretClient } = require('@azure/keyvault-secrets');
const {  AzureOpenAI } = require('openai');
const sharp = require('sharp');
const e = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();



app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // or specify a particular origin
  next();
});
app.use(cors());
app.use(express.json({limit: '50mb'}));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001", "https://aara-frontend-aries.azurewebsites.net"],
    methods: ["GET", "POST", "OPTIONS"]
  }
});

/**
 * Define the OpenAI Assistant IDs for different agents:
 * a. Orchestration Agent: Coordinates the workflow between other agents.
 * b. Score and Cost Analyzer: Analyzes the cost and performance scores of the current architecture.
c. Intent Clarifier/Question Generator: Clarifies user intents and generates relevant questions.
d. User Input/System Requirement Analyzer: Analyzes user inputs and system requirements.
e. Feedback Analyzer: Analyzes user feedback on recommendations.
f. Recommendations Agent: Generates recommendations based on analyses.
g. Validator Agent: Validates the feasibility of recommendations.
h. Evaluator Agent: Evaluates the potential impact of recommendations.
i. Planner Agent: Creates implementation plans for approved recommendations.
j. Policy Creation Agent: Generates Azure policies based on recommendations.
 */
const RECOMMENDATIONS_ASSISTANT_ID = process.env.OPENAI_RECOMMENDATIONS_ASSISTANT_ID||"asst_J07V163q6anWPNkT8qz35bgM";
const VALIDATION_ASSISTANT_ID = process.env.OPENAI_VALIDATION_ASSISTANT_ID||"asst_XpF2cFhBP5nJC55BVZOMM3YP";
const ORCHESTRATOR_ASSISTANT_ID = process.env.OPENAI_ORCHESTRATOR_ASSISTANT_ID||"asst_gsAFQr99F9IjFK4eLitI27WI";
const RESILIENCE_ASSISTANT_ID = process.env.OPENAI_RESILIENCE_ASSISTANT_ID||"asst_7BMlrtqXn7be0G8R7qK2U5Dg";
const SCOREANDCOST_ASSISTANT_ID = process.env.OPENAI_SCOREANDCOST_ASSISTANT_ID||"asst_7BMlrtqXn7be0G8R7qK2U5Dg";
const INTENT_CLARIFIER_ASSISTANT_ID = process.env.OPENAI_INTENT_CLARIFIER_ASSISTANT_ID||"asst_7BMlrtqXn7be0G8R7qK2U5Dg";
const USERINPUT_ASSISTANT_ID = process.env.OPENAI_USERINPUT_ASSISTANT_ID||"asst_bpCvZEttvF6yzm9ppm6szE6D";
const FEEDBACK_ASSISTANT_ID = process.env.OPENAI_FEEDBACK_ASSISTANT_ID||"asst_7wcqNo4rSCuM2JxbEJXfVbyz";
const PLANNER_ASSISTANT_ID = process .env.OPENAI_PLANNER_ASSISTANT_ID||"asst_01d8rVmwfF83C2asx7GzRDKL";
const POLICY_ASSISTANT_ID = process .env.OPENAI_POLICY_ASSISTANT_ID||"asst_X0apkdIjPMBTvCobj0micwDm";
const EVALUATOR_ASSISTANT_ID = process.env.OPENAI_EVALUATOR_ASSISTANT_ID||" asst_u9ZVZYv40XtGH6vgUYF4Ygma";





const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID||RECOMMENDATIONS_ASSISTANT_ID;

const PORT = process.env.PORT || 5000;

// Azure setups
const credential = new ManagedIdentityCredential();
const keyVaultName = process.env.AZURE_KEYVAULT_NAME;
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
const secretClient = new SecretClient(keyVaultUrl, credential);
const resourceGraphClient = new ResourceGraphClient(credential);

// In-memory storage for thread IDs (replace with a database in production)
const userThreads = new Map();
let openaiClient;
let openaiDeployment;
initializeOpenAI().catch(console.error);
async function initializeOpenAI() {
    const openaiKey = await secretClient.getSecret('AZURE-OPENAI-API-KEY');
    const openaiEndpoint = await secretClient.getSecret('AZURE-OPENAI-ENDPOINT');
    openaiDeployment = await secretClient.getSecret('AZURE-OPENAI-GPT-DEPLOYMENT');
    const openaiVersion = await secretClient.getSecret('AZURE-OPENAI-VERSION');
    
    const configuration = {
        apiKey: openaiKey.value,
        apiVersion: openaiVersion.value,
        deployment: openaiDeployment.value,
        endpoint: openaiEndpoint.value
    };
    
    openaiClient = new AzureOpenAI(configuration);
  //   const openAIService = new OpenAIService(openaiClient);

  //   const orchestrator = new OrchestratorAgent(openAIService);
  // const scoreAnalyzer = new ScoreAndCostAnalyzerAgent(openAIService);
  // const intentClarifier = new IntentClarifierAgent(openAIService);
  // const requirementAnalyzer = new RequirementAnalyzerAgent(openAIService);
  // const feedbackAnalyzer = new FeedbackAnalyzerAgent(openAIService);
  // const recommendationsAgent = new RecommendationsAgent(openAIService);
  // const validator = new ValidatorAgent(openAIService);
  // const evaluator = new EvaluatorAgent(openAIService);
  // const planner = new PlannerAgent(openAIService);
  // const policyCreator = new PolicyCreationAgent(openAIService);
}
const getOrCreateThreadForUser = async (userId) => {
  if (userThreads.has(userId)) {
    return userThreads.get(userId);
  }
  const thread = await openaiClient.beta.threads.create();
  userThreads.set(userId, thread.id);
  return thread.id;
};





// Set up multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Azure Blob Storage setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerName = 'architecture-diagrams';



// Function to extract content from a URL
async function extractContentFromUrl(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    // Extract the main content (this is a simple example, might need adjustment based on the specific websites)
    return summarizeContentGPT($('body').text());
    
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error);
    return null;
  }
}

// Function to summarize content using GPT-4V
async function summarizeContentGPT(content) {
  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are an expert in summarizing the Azure Resilience content. Please provide a concise summary (2000 characters) of the resilience features , the execution instructions from the following text from Azure docs:" },
      { role: "user", content: content }
    ]
  });
  console.log(response.choices[0].message.content);
  return response.choices[0].message.content;
}


// Function to get Azure resource details
async function getAzureResourceDetails(subscriptionId, resourceId, apiVersion="2022-01-01") {
    // const client = new ResourceManagementClient(credential, subscriptionId);
    // return await client.resources.getById(resourceId, apiVersion)
    return await executeARGQuery(`Resources | where id == '${resourceId}'`, [subscriptionId]);
  }

  // Function definitions for the Assistant
const functions = [
    {
      name: 'get_azure_resource_details',
      description: 'Get details of an Azure resource, the tags associated with it, and its properties',
      parameters: {
        type: 'object',
        properties: {
          subscriptionId: {
            type: 'string',
            description: 'The Azure subscription ID'
          },
          resourceId: {
            type: 'string',
            description: 'Fully qualified resource ID of the Azure resource'
          },
          apiVersion: {
            type: 'string',
            description: 'The API version to use for fetching resource details, depends on the resource type of the selected resource. cannot be undefined, example: 2024-01-01'
          }
        },
        required: ['subscriptionId', 'resourceId', 'apiVersion']
      }
    },{
      name: "execute_arg_query",
      description: "Execute an Azure Resource Graph query to fetch resources that match the specified criteria",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The ARG query to execute"
          },
          subscriptions: {
            type: "array",
            items: {
              type: "string"
            },
            description: "List of subscription IDs to query"
          }
        },
        required: ["query", "subscriptions"]
      }
    },
    {
      name : "extract_content_from_url",
      description: "Extract the content from a given URL",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL from which to extract content"
          }
        },
        required: ["url"]
      }
    },
    {
      name: "get_all_azure_resource_details_for_subscription",
      description: "Get all Azure resources for a given subscription",
      parameters: {
        type: "object",
        properties: {
          subscriptionId: {
            type: "string",
            description: "The Azure subscription ID"
          }
        },
        required: ["subscriptionId"]
      }
    }
  ];
  async function executeARGQuery(query, subscriptions) {
    try {
      console.log(query, subscriptions);
      const response = await resourceGraphClient.resources({
        query: query,
        subscriptions: subscriptions
      });
      // console.log(JSON.stringify(response, null, 2));
      return response;
    } catch (error) {
      console.error('Error executing ARG query:', error);
      throw error;
    }
  }
  app.post('/execute-arg-query', async (req, res) => {
    const { query, subscriptions } = req.body;
    console.log(query, subscriptions);
  
    if (!query || !subscriptions || !Array.isArray(subscriptions)) {
      return res.status(400).send('Invalid request. Query and subscriptions array are required.');
    }
    console.log(query, subscriptions);
  
    try {
      const response = await executeARGQuery(query, subscriptions);  
      res.json(response);
    } catch (error) {
      console.error('Error executing ARG query:', error);
      res.status(500).send('Error executing ARG query');
    }
  });

  // Add a test route
app.get('/test', (req, res) => {
  res.send('Server is running correctly');
});
app.post('/upload', upload.single('diagram'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobName = `diagram-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(req.file.buffer, req.file.size);

    res.status(200).json({ message: 'File uploaded successfully', blobUrl: blockBlobClient.url });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file');
  }
});

app.post('/fetch-resources', async (req, res) => {
  const { subscriptionId, resourceGroupId } = req.body;

  if (!subscriptionId) {
    return res.status(400).send('Subscription ID is required.');
  }

  try {
    const client = new ResourceManagementClient(credential, subscriptionId);
    const resources = [];
      for await (const resource of (resourceGroupId?client.resources.listByResourceGroup(resourceGroupId):client.resources.list())) {
        resources.push({
          name: resource.name,
          type: resource.type,
          location: resource.location,
          id: resource.id,
          properties: resource.properties,
          type: resource.type,
          kind: resource.kind,
          tags: resource.tags
        });
      }

    res.status(200).json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).send('Error fetching Azure resources');
  }
});

// Function to fetch resources with pagination
async function fetchAllResources(subscriptions) {
  let allResources = [];
  let skipToken = null;
  const batchSize = 1000; // Adjust based on your needs and API limits

  do {
    const query = "Resources | project id, name, type, location, resourceGroup";
    const response = await resourceGraphClient.resources({
      query: query,
      subscriptions: subscriptions,
      options: {
        $skipToken: skipToken,
        $top: batchSize
      }
    });

    allResources = allResources.concat(response.data);
    skipToken = response.$skipToken;

    console.log(`Fetched ${allResources.length} resources so far...`);
  } while (skipToken);

  console.log(`Total resources fetched: ${allResources.length}`);
  return allResources;
}

// async function analyzeResourcesBatch(resources, batchSize = 10) {
//   let allRecommendations = [];
  
//   for (let i = 0; i < resources.length; i += batchSize) {
//     const batch = resources.slice(i, i + batchSize);
//     const batchAnalysis = await analyzeResourceBatch(batch);
//     allRecommendations = allRecommendations.concat(batchAnalysis);
    
//     console.log(`Analyzed batch ${i / batchSize + 1}, total recommendations: ${allRecommendations.length}`);
//   }

//   return allRecommendations;
// }

// Function to extract components using GPT-4V
async function extractComponentsGPT(imageBuffer, resources) {
  const base64Image = imageBuffer? imageBuffer.toString('base64'): null;
  
  const systemMessage = `
    You are an expert system designed to analyze architecture diagrams and output structured information about the components and their relationships. Always respond using the following format:

    \`\`\`
    NODES
    <node_name>: <node_description>
    ...

    EDGES
    <source_node>,<target_node>: <relationship_description>
    ...

    PROPERTIES
    <node_or_edge>: <property_name>=<property_value>
    ...

    RESILIENCE ANALYSIS
    Current RTO: <estimated_RTO>
    Current RPO: <estimated_RPO>
    Current  Availability SLI: <estimated_SLI>
    Bottlenecks: <identified_bottlenecks>
    Single Points of Failure: <SPOFs>
    ...
    \`\`\`

    Ensure all node names are unique and descriptive. Edge definitions should use the exact node names. Include relevant properties like component type, connection strength, or data flow direction.
  `;

  const userMessage = `
    Analyze this architecture diagram and the following list of Azure resources. Identify all components, their relationships, and any notable features or configurations. Use the specified structure in your response. Here are the Azure resources:

    ${resources.map(r => `${r.name} (${r.type}) - ${r.location}`).join('\n')}

    Ensure that your analysis incorporates both the diagram and the resource list.
  `;

  const response = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    messages:[
      { role: "system", content: systemMessage },
      { 
        role: "user", 
        content: base64Image?[
          { type: "text", text: userMessage },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ]: [ {type: "text", text: userMessage }]
      }
    ]}
  );
  console.log(response.choices[0].message.content);

  return response.choices[0].message.content;
}

function validateComponentStructure(components) {
  const requiredSections = ['NODES', 'EDGES', 'PROPERTIES', 'RESILIENCE ANALYSIS'];
  const sections = {};

  let currentSection = null;
  for (const line of components.split('\n')) {
    const trimmedLine = line.trim();
    if (requiredSections.includes(trimmedLine)) {
      currentSection = trimmedLine;
      sections[currentSection] = true;
    } else if (currentSection && trimmedLine) {
      sections[currentSection] = true;
    }
  }

  const missingSections = requiredSections.filter(section => !sections[section]);
  if (missingSections.length > 0) {
    throw new Error(`Component structure is invalid. Missing sections: ${missingSections.join(', ')}`);
  }

  return true;
}
// make diagram oprional
app.post('/analyze-architecture',  upload.fields([{ name: 'diagram', maxCount: 1 }]), async (req, res) => {
  let imageBuffer = null;
  if (req.file) {
    const diagramFile = req.files['diagram'] ? req.files['diagram'][0] : null;
     imageBuffer = await sharp(diagramFile.buffer).jpeg().toBuffer();
  
  }

  const { resources } = req.body;

  if (!resources) {
    return res.status(400).send('Resource list is required.');
  }

  try {
    
    const analysis = await extractComponentsGPT(imageBuffer, JSON.parse(resources));
    validateComponentStructure(analysis);
    res.status(200).json({ analysis });
  } catch (error) {
    console.error('Error analyzing architecture:', error);
    res.status(500).send(`Error analyzing architecture: ${error.message}`);
  }
});

app.post('/analyze-resources-with-arg', async (req, res) => {
  const { userId, resources, query, subscriptions } = req.body;
  console.log(resources, query, subscriptions);
  const threadId = await getOrCreateThreadForUser(userId);
  try {
    await openaiClient.beta.threads.messages.create(threadId, {
      role: "user",
      content: `Analyze the following Azure resources for resilience features using Azure Resource Graph:
        ${JSON.stringify(resources)}
        For each resource, identify the inherent Azure features for resilience by executing an Azure Resource Graph queries from APRL ARG queries and recommendations for the given resource type., 
        whether they are likely being utilized, and provide actionable steps with 
        deep links to the Azure portal for configuration or review.
        1. Ensure that the analysis is focused on resilience aspects only such as high availability, fault tolerance, disaster recovery, and scalability.
        2. Include details about the current configuration, potential improvements, and the impact on resilience.
        3. Do not make generalizations or assumptions about the resources; focus on Azure-specific resilience features.
        4. Do not include security, compliance, or non-Azure solutions in the analysis.
        5. Do not repeat the same recommendations for the same resource.
        6. Always respond with clear plan and actionable steps for each resource to reduce overall impact on the architecture.
        7. Always leverage the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
        8. Ensure that the analysis is detailed, accurate, and actionable, with clear steps for implementation.
        9. Donot repeat the same recommendations for the same resource.
        10. Always respond using the following format:
        ### Resource: [Resource Name]
        ### Resource Type: [Resource Type]
        ### ARG Query: [Azure Resource Graph query used for analysis from APRL recommendations files]
        ### Resilience Features: [List of resilience features]
        ### Utilization: [Likelihood of utilization]
        ### Recommendations: [Actionable steps for improvement with links to Azure documentation]
        ### ARG Analysis: [Azure Resource Graph analysis details for this resource]
        ### Insights: [Additional insights or observations]
        ### Impact: [Impact on resilience]
        ### Targeted Azure Services: [Azure services for configuration]
        ### Tags: [Azure tags for tracking]
        ### Properties: [Resource properties]
        ### Deep Links: [Azure portal link description for configuration](Azure portal link url for configuration)
        ...
      `
    });

    const run = await openaiClient.beta.threads.runs.create(threadId, {
      assistant_id: RESILIENCE_ASSISTANT_ID,
      tools: [{ type: "function", function: functions[0] },
              { type: "function", function: functions[1] },
              { type: "file_search" }],
      tool_resources:{file_search: { vector_store_ids: ["vs_DhicZE5tY7FJVGMZESRRZk4p"]}}
    });

    let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);

    while (runStatus.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);

      if (runStatus.status === 'requires_action') {
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'get_azure_resource_details') {
            const { subscriptionId, resourceId, apiVersion} = JSON.parse(toolCall.function.arguments);
            try {

              const resourceDetails = await getAzureResourceDetails(subscriptionId, resourceId, apiVersion);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(resourceDetails)
              });
            } catch (error) {
              console.error('Error fetching Azure resource details:', error);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({ error: `Failed to fetch azure resource details due to error : ${error}` })
              });
            }
          } else if (toolCall.function.name === 'execute_arg_query') {
            const { query, subscriptions } = JSON.parse(toolCall.function.arguments);
            try {
              const response = await executeARGQuery(query, subscriptions);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(response)
              });
            } catch (error) {
              console.error('Error executing ARG query:', error);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({ error: `Failed to execute ARG query due to error : ${error}` })
              });
            }
          }
        }

        await openaiClient.beta.threads.runs.submitToolOutputs(threadId, run.id, { tool_outputs: toolOutputs });
      }
    }

    const messages = await openaiClient.beta.threads.messages.list(threadId);
    const analysisResult = messages.data[0].content[0].text.value;

    res.json({ analysis: analysisResult });
  } catch (error) {
    console.error('Error in resource analysis:', error);
    res.status(500).json({ error: 'An error occurred during resource analysis' });
  }
});

app.post('/analyze-resources', async (req, res) => {
    const { resourceType, resources } = req.body;
    //console.log(resources);
    //const threadId = await getOrCreateThreadForUser(userId);
   
  
    try {

      // Step 1: Generate Recommendations for each resource
      let allRecommendations = [];
      const batchSize = 10;
  
      for (let i = 0; i < resources.length; i += batchSize) {
        const batch = resources.slice(i, i + batchSize);
        const analysisThread = await openaiClient.beta.threads.create();
        const threadId = analysisThread.id;
      await openaiClient.beta.threads.messages.create(threadId, {
        role: "user",
        content: `Run Azure Resource Graph queries to evaluate  and Analyze resilience features for the following Azure resources:
        use ARG resilience analysis queries to evaluate the resilience features and best practices for the resource type: ${resourceType} of the given resources, using the APrl recommendations files provided for each aprlGuid (recommendationId).
          ${JSON.stringify(batch)}
          For each resource, identify the inherent Azure features for resilience, 
          whether they are likely being utilized, and provide actionable steps with 
          deep links to the Azure portal for configuration or review.
          1. Ensure that the analysis is focused on resilience aspects only such as high availability, fault tolerance, disaster recovery, and scalability.
          2. Include details about the current configuration, potential improvements, and the impact on resilience.
          3. Do not make generalizations or assumptions about the resources; focus on Azure-specific resilience features.
          4. Donot include security, compliance, or non-Azure solutions in the analysis.
          5. Do not repeat the same recommendations for the same resource.
          6. Always respond with clear plan and actionable steps for each resource to reduce overall impact on the architecture.

          For Example, In the following Azure Resource Graph (ARG) query for APRL recommendation :2ad78dec-5a4d-4a30-8fd1-8584335ad781, for storage accounts 
          to finds all the storage accounts that can be upgraded to general purpose v2, the query fetches the storage accounts with their performance and replication details.:
          ------------------------------------------------------------------------------------------------
          --- Content of 2ad78dec-5a4d-4a30-8fd1-8584335ad781.kql ---
            // Azure Resource Graph Query
            // Find all Azure Storage Accounts, that upgradeable to General purpose v2.
            Resources
            | where type =~ "Microsoft.Storage/storageAccounts" and kind in~ ("Storage", "BlobStorage")
            | extend
                param1 = strcat("AccountKind: ", case(kind =~ "Storage", "Storage (general purpose v1)", kind =~ "BlobStorage", "BlobStorage", kind)),
                param2 = strcat("Performance: ", sku.tier),
                param3 = strcat("Replication: ", sku.name)
            | project recommendationId = "2ad78dec-5a4d-4a30-8fd1-8584335ad781", name, id, tags, param1, param2, param3

          ---------------------------------------------------------
          For Recommendations:
          Leveraging the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
          Always leverage the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
          Ensure that the analysis is detailed, accurate, and actionable, with clear steps for implementation.
          Avoid generalizations or assumptions about the resources and focus on Azure-specific resilience features.
          Avoid discussing security, compliance, third party or non-Azure solutions in the analysis.
          For each resource, identify the inherent Azure features for resilience, whether they are likely being utilized, and provide actionable steps with deep links to the Azure portal for configuration or review.
          provide details about the current configuration, potential improvements, and the impact on resilience.
          Provide specific configuration recommendations for each resource based on the resilience analysis focusing on Azure-specific features.          
          for example: retentation policy, geo-redundancy, replication, backup, supported by Azure, for the given resource type based on the resilience analysis and user requirements.
          Always make sure the analysis is detailed, accurate, and actionable, with clear steps for implementation and is validated against azure documentation.
          Do not provide recommendations, actions or configurations that are not relevant or supported by Azure services for the given resource type.
          
          Ensure that the analysis is focused on resilience aspects such as high availability,
          fault tolerance, disaster recovery, and scalability. Include details about the
          current configuration, potential improvements, and the impact on resilience.
          Provide specific recommendations for each resource based on the resilience analysis focusing on Azure-specific features. 
          The analysis should be detailed, accurate, and actionable, with clear steps for implementation.
          Avoid generalizations or assumptions about the resources and focus on Azure-specific resilience features.
          Always respond using the following format:

          ### Resource: [Resource Name]
          ### Resilience Features: [List of resilience features]
          ### Utilization: [Likelihood of utilization]
          ### Resource Type: [Resource Type]
          ### ARG Query: [List of Azure Resource Graph query used for analysis from APRL recommendations files]
          ### Recommendations: [Actionable steps for improvement with links to Azure documentation]
          ### ARG Analysis: [Azure Resource Graph analysis details for this resource]
          ### Insights: [Additional insights or observations]
          ### Impact: [Impact on resilience]
          ### Targeted Azure Services: [Azure services for configuration]
          ### Tags: [Azure tags for tracking]
          ### Properties: [Resource properties]
          ### Deep Links: [Azure portal link description for configuration](Azure portal link url for configuration)
          ...
          `
      });
  
      const run = await openaiClient.beta.threads.runs.create(threadId, {
        assistant_id: RESILIENCE_ASSISTANT_ID,
        tools: [{ type: "function", function: functions[0] },
                { type: "function", function: functions[1] },
                { type: "file_search" }],
        tool_resources:{file_search: { vector_store_ids: ["vs_DhicZE5tY7FJVGMZESRRZk4p"]}}       
      });
  
      let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
      
      while (runStatus.status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
  
        if (runStatus.status === 'requires_action') {
          const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = [];
  
          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'get_azure_resource_details') {
              const { subscriptionId, resourceId, apiVersion} = JSON.parse(toolCall.function.arguments);
              try {
                console.log(subscriptionId, resourceId, apiVersion);
                const resourceDetails = await getAzureResourceDetails(subscriptionId, resourceId, apiVersion);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(resourceDetails)
                });
              } catch (error) {
                console.error('Error fetching Azure resource details:', error);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({ error: `Failed to fetch azure resource details due to error : ${error}` })
                });
              }
            } else if (toolCall.function.name === 'execute_arg_query') {
              const { query, subscriptions } = JSON.parse(toolCall.function.arguments);
              try {
                const response = await executeARGQuery(query, subscriptions);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(response)
                });
              } catch (error) {
                console.error('Error executing ARG query:', error);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({ error: `Failed to execute ARG query due to error : ${error}` })
                });
              }
            }
          }
  
          await openaiClient.beta.threads.runs.submitToolOutputs(threadId, run.id, { tool_outputs: toolOutputs });
        }
      }
  
      const messages = await openaiClient.beta.threads.messages.list(threadId);
      const analysisResult = messages.data[0].content[0].text.value;
      console.log(` step 1 result  for batch ${i / batchSize + 1} : ${analysisResult}`);
      io.emit('analysis', ` step 1 result  for batch ${i / batchSize + 1} : ${analysisResult}`);

      // Step 2: Generate Recommendations for each resource type
      const recommendationsThread = await openaiClient.beta.threads.create();
      await openaiClient.beta.threads.messages.create(recommendationsThread.id, {
        role: "user",
        content: `Analyze the following Azure resources for resilience features using Azure Resource Graph:

        Azure resources: ${JSON.stringify(batch)}
        Azure resource type: ${resourceType}
        only  focus on analysis at resource type level and not at individual resource level.
        Identify the inherent Azure features for resilience, whether they are likely being utilized, and provide actionable steps with deep links to the Azure portal for configuration or review.
        For the  azure resource provider, ${resourceType}, identified from the given azure resources, identify the inherent Azure features for resilience, whether they are likely being utilized, and provide actionable steps with deep links to the Azure portal for configuration or review.
        1. Ensure that the analysis is focused on resilience aspects only such as high availability, fault tolerance, disaster recovery, and scalability.
        2. Include details about the current configuration, potential improvements, and the impact on resilience.
        3. Do not make generalizations or assumptions about the resources; focus on Azure-specific resilience features.
        4. Do not include security, compliance, or non-Azure solutions in the analysis.
        5. Do not repeat the same recommendations for the same resource.
        6. Always respond with clear plan and actionable steps for each resource to reduce overall impact on the architecture.
        7. Always leverage the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
        8. Ensure that the analysis is detailed, accurate, and actionable, with clear steps for implementation.
        9. Refer to the Azure Resource Graph queries for the given resources and their configurations for the analysis.
        10. Use the APRL recommendations files provided for each aprlGuid (recommendationId) to fetch the resilience analysis queries for the given resource type.
        11. extract the web data from the url links to the Azure documentation for the given resource type to provide the Resilience Features, recommendations and actionable steps for improvement.
        12. Always respond using the following format:
        ### Resource Type : [Resource Type]
        ### Resources: [Resource Names]
        ### Resilience Features: [List of resilience features for the resource type]
        ### ARG Query: [List of Azure Resource Graph query used for querying from APRL recommendation files]
        ### Recommendations: [Actionable steps for improvement with links to Azure documentation]
        ### ARG Analysis: [Azure Resource Graph analysis details for this resource]
        ### Insights: [Additional insights or observations]
        ### Impact: [Impact on resilience]
        ### Targeted Azure Services: [Azure services for configuration]
        ### Tags: [Azure tags for tracking]
        ### Properties: [Resource properties]
        ### Deep Links: [Azure portal link description for configuration](Azure portal link url for configuration)
        ...
        `
      });

      let recommendationsRun = await openaiClient.beta.threads.runs.create(recommendationsThread.id, {
        assistant_id: RESILIENCE_ASSISTANT_ID,
        tools: [{ type: "function", function: functions[2] },
                { type: "function", function: functions[1] },
                { type: "file_search" }],
        tool_resources:{file_search: { vector_store_ids: ["vs_DhicZE5tY7FJVGMZESRRZk4p"]}}
      });

      while (recommendationsRun.status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        recommendationsRun = await openaiClient.beta.threads.runs.retrieve(recommendationsThread.id, recommendationsRun.id);

        if (recommendationsRun.status === 'requires_action') {
          const toolCalls = recommendationsRun.required_action.submit_tool_outputs.tool_calls;
          const toolOutputs = [];

          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'get_azure_resource_details') {
              const { subscriptionId, resourceId, apiVersion} = JSON.parse(toolCall.function.arguments);
              try {
                const resourceDetails = await getAzureResourceDetails(subscriptionId, resourceId, apiVersion);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(resourceDetails)
                });
              } catch (error) {
                console.error('Error fetching Azure resource details:', error);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({ error: `Failed to fetch azure resource details due to error : ${error}` })
                });
              }
            } else if (toolCall.function.name === 'execute_arg_query') {
              const { query, subscriptions } = JSON.parse(toolCall.function.arguments);
              try {
                const response = await executeARGQuery(query, subscriptions);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify(response)
                });
              } catch (error) {
                console.error('Error executing ARG query:', error);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({ error: `Failed to execute ARG query due to error : ${error}` })
                });
              }
            } else if (toolCall.function.name === 'extract_content_from_url') {
              const { url } = JSON.parse(toolCall.function.arguments);
              const content = await extractContentFromUrl(url);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({ content: content || "Unable to extract content" })
              });
            }
          }

          await openaiClient.beta.threads.runs.submitToolOutputs(recommendationsThread.id, recommendationsRun.id, {
            tool_outputs: toolOutputs
          });
        }
      }

      const recommendationsMessages = await openaiClient.beta.threads.messages.list(recommendationsThread.id);
      const recommendations = recommendationsMessages.data[0].content[0].text.value;

      console.log(` step 2 result  for batch ${i / batchSize + 1} : ${recommendations}`);
      io.emit('recommendations', ` step 2 result  for batch ${i / batchSize + 1} : ${recommendations}`);
      

      // Step 3: Validate Recommendations
    const validatorThread = await openaiClient.beta.threads.create();
    await openaiClient.beta.threads.messages.create(validatorThread.id, {
      role: "user",
      content: `Validate these recommendations and their associated links: ${analysisResult} and ${recommendations}. 
      Ensure that the recommendations are accurate, actionable, and relevant to the architecture and resources provided. Validate the links to Azure documentation and provide additional context or insights where necessary.
      1. Always validate the recommendations against the Azure documentation and ensure that the links are accurate and relevant and not broken.
      2. Ensure that the recommendations are actionable and provide clear steps for implementation.
      3. Avoid generalizations or assumptions about the resources and focus on Azure-specific resilience features.
      4. Always ensure there are no repeated recommendations for the same resource.
      5. Always ensure that the recommendations are validated against the Azure documentation.
      
      Always respond using the following format:
      ### Recommendation 1: [Recommendation]
      ### Validation: [Validation result]
      ### Evidence: [Supporting evidence]
      ### Link: [Azure documentation link]
      ### Additional Context: [Additional context or insights]
      ### possible improvements: [Improvements]
      ...
      `
    });

    let validatorRun = await openaiClient.beta.threads.runs.create(validatorThread.id, {
      assistant_id: VALIDATION_ASSISTANT_ID
    });

    while (validatorRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      validatorRun = await openaiClient.beta.threads.runs.retrieve(validatorThread.id, validatorRun.id);

      if (validatorRun.status === 'requires_action') {
        const toolCalls = validatorRun.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'extract_content_from_url') {
            const { url } = JSON.parse(toolCall.function.arguments);
            const content = await extractContentFromUrl(url);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ content: content || "Unable to extract content" })
            });
          }
        }

        await openaiClient.beta.threads.runs.submitToolOutputs(validatorThread.id, validatorRun.id, {
          tool_outputs: toolOutputs
        });
      }
    }

    const validatorMessages = await openaiClient.beta.threads.messages.list(validatorThread.id);
    const validationResults = validatorMessages.data[0].content[0].text.value;
    console.log(validationResults);
    io.emit('validation', ` step 3 result  for batch ${i / batchSize + 1} : ${validationResults}`);
    // Step 4: Final Orchestration
    const orchestratorThread = await openaiClient.beta.threads.create();
    await openaiClient.beta.threads.messages.create(orchestratorThread.id, {
      role: "user",
      content: `Compile the final analysis based on these recommendations: ${recommendations} and ${analysisResult} and validation results: ${validationResults}. Include only validated recommendations with their supporting evidence.
      Ensure that the final analysis is accurate, actionable, and relevant to the architecture and resources provided. Provide additional context or insights where necessary.
      
      For Recommendations:
          Leveraging the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
          Always leverage the Azure Resource Graph to fetch additional details about the given resources and their configurations for the analysis.
          Ensure that the analysis is detailed, accurate, and actionable, with clear steps for implementation.
          Avoid generalizations or assumptions about the resources and focus on Azure-specific resilience features.
          Avoid discussing security, compliance, third party or non-Azure solutions in the analysis.
          For each resource, identify the inherent Azure features for resilience, whether they are likely being utilized, and provide actionable steps with deep links to the Azure portal for configuration or review.
          provide details about the current configuration, potential improvements, and the impact on resilience.
          Provide specific configuration recommendations for each resource based on the resilience analysis focusing on Azure-specific features.          
          for example: retentation policy, geo-redundancy, replication, backup, supported by Azure, for the given resource type based on the resilience analysis and user requirements.
          Always make sure the analysis is detailed, accurate, and actionable, with clear steps for implementation and is validated against azure documentation.
          Do not provide recommendations, actions or configurations that are not relevant or supported by Azure services for the given resource type.
          
          Ensure that the analysis is focused on resilience aspects such as high availability,
          fault tolerance, disaster recovery, and scalability. Include details about the
          current configuration, potential improvements, and the impact on resilience.
          Provide specific recommendations for each resource based on the resilience analysis focusing on Azure-specific features. 
          The analysis should be detailed, accurate, and actionable, with clear steps for implementation.
          Avoid generalizations or assumptions about the resources and focus on Azure-specific resilience features.
          Always respond using the following format for the final analysis similar to the original recommendations:

          ### Resource: [Resource Name]
          ### Resilience Features: [List of resilience features]
          ### Utilization: [Likelihood of utilization]
          ### Resource Type: [Resource Type]
          ### ARG Query: [List of Azure Resource Graph query used for analysis from APRL recommendations files]
          ### Recommendations: [Actionable steps for improvement with links to Azure documentation]
          ### ARG Analysis: [Azure Resource Graph analysis details for this resource]
          ### Insights: [Additional insights or observations]
          ### Impact: [Impact on resilience]
          ### Targeted Azure Services: [Azure services for configuration]
          ### Tags: [Azure tags for tracking]
          ### Properties: [Resource properties]
          ### Deep Links: [Azure portal link description for configuration](Azure portal link url for configuration)
          ...`
    });

    let orchestratorRun = await openaiClient.beta.threads.runs.create(orchestratorThread.id, {
      assistant_id: ORCHESTRATOR_ASSISTANT_ID
    });

    while (orchestratorRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      orchestratorRun = await openaiClient.beta.threads.runs.retrieve(orchestratorThread.id, orchestratorRun.id);
    }

    const finalMessages = await openaiClient.beta.threads.messages.list(orchestratorThread.id);
    const finalAnalysis = finalMessages.data[0].content[0].text.value;

    allRecommendations = allRecommendations.concat(finalAnalysis);
    
    console.log(`Analyzed batch ${i / batchSize + 1}, total recommendations: ${allRecommendations.length}`);
    io.emit('final-analysis', ` step 4 result  for batch ${i / batchSize + 1} : ${finalAnalysis}`);
  }
    console.log(allRecommendations);
    res.json({ analysis: allRecommendations });
  } catch (error) {
    console.error('Error in resource analysis:', error);
    res.status(500).json({ error: 'An error occurred during resource analysis' });
  }
  
    //   res.json({ analysis: analysisResult });
    // } catch (error) {
    //   console.error('Error in resource analysis:', error);
    //   res.status(500).json({ error: 'An error occurred during resource analysis' });
    // }
  });

app.post('/generate-questions', async (req, res) => {
    const { components, resources, resourceAnalysis, resiliencyRequirements, userId } = req.body;
    const threadId = await getOrCreateThreadForUser(userId);
  
    try {
      const prompt = `Generate 3 to 5 relevant clarifying questions about the recommendations provided based on the system architecture and resources provided.
        Current architecture: ${JSON.stringify(components)}
        Resources: ${JSON.stringify(resources)}
        Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
        Resiliency Requirements:
        - RPO: ${resiliencyRequirements.rpo}
        - RTO: ${resiliencyRequirements.rto}
        - Application SLI: ${resiliencyRequirements.appSLI}
        - Other Requirements: ${resiliencyRequirements.otherRequirements}

  
        Generate questions that:
        1. Clarify specific details about the current Azure services and their configurations
        2. Address potential gaps in the resilience strategy
        3. Explore the customer's specific resilience requirements or SLAs
        4. Investigate any ambiguities about zonal or regional deployments
        5. Seek more information about resilience features for each of the Azure service at the architecture level as well as the resource level
  
        Ensure all questions are directly related to Azure services and resilience aspects only.
        The questions should be clear, concise, and focused on gathering additional information to improve the recommendations.
        Avoid general or open-ended questions that do not provide actionable insights.
        Provide context for each question based on the architecture and requirements.
        The questions should be relevant to the current architecture and the provided resiliency requirements.
        The format of the questions should be in the form of a question, not a statement.
        The questions should be specific and avoid generalizations or assumptions.
        Always respond using the following format:

        ### Question 1 [Reason for Clarification and Resource type] : [Your question here]
        ### Question 2 [Reason for Clarification and Resource type] : [Your question here]
        ...

        for example:
        ### Question 1 [Clarification on Azure Services and Configurations]: Could you provide more details about the sizing and scaling configurations for the App_Service_Plans in both zones (Zone1 and Zone2)?
        ### Question 2 [on Azure Services and Configurations]:  How is the Azure Redis Cache configured in terms of capacity, eviction policy, and persistence settings?

        `;

        await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
           const response= assistantMessage.content[0].text.value;
  
    //   const response = await openaiClient.chat.completions.create({        
    //     model: "gpt-4o",
    //     messages:[
    //         { role: "system", content: "You are an AI assistant specialized in Azure architecture and resilience strategies." },
    //         { role: "user", content: prompt }
    //         ]}
    //   );
            console.log(response);
            // filter questions not inclusing [Question
      const questions = response.split('\n').filter(q => q.trim() !== '').filter(q => q.includes('### Question'));      
      //console.log(response.choices[0].message.content);
      console.log(questions);
      res.status(200).json({ questions });
    } catch (error) {
      console.error('Error generating questions:', error);
      res.status(500).send('Error generating questions');
    }
  });
  

  app.post('/generate-recommendations', async (req, res) => {
    const { components, resources, resourceAnalysis, answers, resiliencyRequirements, userId } = req.body;
    
    const threadId = await getOrCreateThreadForUser(userId);
  
    try {
      const prompt = `Generate most relevant resiliency recommendations based on the following:
        Architecture: ${JSON.stringify(components)}
        Resources: ${JSON.stringify(resources)}        
        Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
        User Inputs: ${JSON.stringify(answers)}
        Resiliency Requirements:
        - RPO: ${resiliencyRequirements.rpo}
        - RTO: ${resiliencyRequirements.rto}
        - Application SLI: ${resiliencyRequirements.appSLI}
        - Other Requirements: ${resiliencyRequirements.otherRequirements}
  
        For your recommendations:
        1. Focus only on Azure services mentioned in the configuration analysis
        2. Prioritize high-impact recommendations (aim for about 20)
        3. Be specific about which services each recommendation applies to
        4. Include detailed, correct implementation steps for each recommendation
        5. Consider zonal and regional deployment options where relevant
        6. Only recommend changes or additions, not services already implemented
        7. Ensure all recommendations are directly related to improving resilience
        8. Identify potential single points of failure
        9. Assess the current level of redundancy and fault tolerance
        10. Evaluate the scalability of the architecture
        11. Consider the impact of zonal vs. regional deployments on resilience
        12. Assess the adequacy of current monitoring and alerting for resilience
        13. Provide recommendations for optimal resilience and fault tolerance in Azure
        14. Explain the steps to execute each recommendation and be specific to Azure services
        15. Provide a clear rationale for each recommendation based on the architecture and requirements
        16.Provide specific configuration recommendations for each resource based on the resilience analysis focusing on Azure-specific features.          
        17.for example: retentation policy, geo-redundancy, replication, backup, supported by Azure, for the given resource type based on the resilience analysis and user requirements.
        18.Always make sure the analysis is detailed, accurate, and actionable, with clear steps for implementation and is validated against azure documentation.
        19.Do not provide recommendations, actions or configurations that are not relevant or supported by Azure services for the given resource type.
        20.Ensure that the analysis is focused on resilience aspects such as high availability,
        21. ***validate the recommendations to ensure the implementation steps and configurations are accurate and feasible***.
  
        Format each recommendation as follows:
        Recommendation: [Brief title]
        Target Service: [Specific Azure service]
        Impact: [High/Medium/Low]
        Cost: [High/Medium/Low]
        Effort: [High/Medium/Low]
        Rationale: [Brief explanation]
        Details: [Detailed explanation]
        List of resources: [Azure resources for configuration]
        Steps:
        1. [Step 1]
        2. [Step 2]
        ...
  
        Focus only on resilience-related aspects and avoid discussing security, compliance, or non-Azure solutions.`;
        await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
                const recommendations =  assistantMessage.content[0].text.value;
  
    //   const response =await openaiClient.chat.completions.create({        
    //     model: "gpt-4o",
    //     messages:[
    //       { role: "system", content: "You are an AI assistant specialized in Azure architecture and resilience strategies." },
    //       { role: "user", content: prompt }
    //     ] }
    //   );
  
    //   const recommendations = response.choices[0].message.content;
      res.status(200).json({ recommendations });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).send('Error generating recommendations');
    }
  });

app.post('/regenerate-recommendations', async (req, res) => {
    const { components, resources, resourceAnalysis, answers, recommendations, resiliencyRequirements, feedback, userId} = req.body;
    const threadId = await getOrCreateThreadForUser(userId);
  
    try {
      const prompt = `Generate most relevant resiliency recommendations based on the following:
        Architecture: ${JSON.stringify(components)}
        Resources: ${JSON.stringify(resources)}        
        Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
        User Inputs: ${JSON.stringify(answers)}
        Resiliency Requirements:
        - RPO: ${resiliencyRequirements.rpo}
        - RTO: ${resiliencyRequirements.rto}
        - Application SLI: ${resiliencyRequirements.appSLI}
        - Other Requirements: ${resiliencyRequirements.otherRequirements}
        - previous recommendations: ${JSON.stringify(recommendations)}
        - Feedback: ${JSON.stringify(feedback)}
  
        For your recommendations:
        1. Focus only on Azure services mentioned in the configuration analysis
        2. Prioritize high-impact recommendations (aim for about 20)
        3. Be specific about which services each recommendation applies to
        4. Include detailed, correct implementation steps for each recommendation
        5. Consider zonal and regional deployment options where relevant
        6. Only recommend changes or additions, not services already implemented
        7. Ensure all recommendations are directly related to improving resilience
        8. Identify potential single points of failure
        9. Assess the current level of redundancy and fault tolerance
        10. Evaluate the scalability of the architecture
        11. Consider the impact of zonal vs. regional deployments on resilience
        12. Assess the adequacy of current monitoring and alerting for resilience
        13. Provide recommendations for optimal resilience and fault tolerance in Azure
        14. Explain the steps to execute each recommendation and be specific to Azure services
        15. Provide a clear rationale for each recommendation based on the architecture and requirements
        16. ***validate the recommendations to ensure the implementation steps and configurations are accurate and feasible***.
        
        Consider the following user feedback when generating new recommendations:
            ${Object.entries(feedback).map(([index, { type, reason }]) => 
                `Recommendation ${recommendations[parseInt(index)]} was ${type}d. Reason: ${reason}`
            ).join('\n')}
            
            Based on this feedback:
            - Emphasize aspects similar to liked recommendations
            - Avoid or improve upon aspects mentioned in disliked recommendations
            - Provide alternative approaches for disliked recommendations
            - Expand on concepts that received positive feedback
            - Address any concerns or issues raised in the feedback
  
        Format each recommendation as follows:
            Recommendation: [Brief title]
            Target Service: [Specific Azure service]
            Impact: [High/Medium/Low]
            Cost: [High/Medium/Low]
            Effort: [High/Medium/Low]
            Rationale: [Brief explanation]
            Details: [Detailed explanation]
            List of resources: [Azure resources for configuration]
            Steps:
            1. [Step 1]
            2. [Step 2]
        ...
  
        Focus only on resilience-related aspects and avoid discussing security, compliance, or non-Azure solutions.`;
  
    //   const response =await openaiClient.chat.completions.create({        
    //     model: "gpt-4o",
    //     messages:[
    //       { role: "system", content: "You are an AI assistant specialized in Azure architecture and resilience strategies." },
    //       { role: "user", content: prompt }
    //     ] }
    //   );
  
    //   const recommendations = response.choices[0].message.content;
    await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
            const recommendationResult = assistantMessage.content[0].text.value;
    
      res.status(200).json({ recommendationResult });
    } catch (error) {
      console.error('Error regenerating recommendations:', error);
      res.status(500).send('Error regenerating recommendations');
    }
  });

  // Endpoint to clear a user's thread (e.g., for starting a new session)
app.post('/clear-thread', async (req, res) => {
    const { userId } = req.body;
    
    if (userThreads.has(userId)) {
      userThreads.delete(userId);
      res.status(200).send('Thread cleared successfully');
    } else {
      res.status(404).send('No thread found for this user');
    }
  });

app.post('/analyze-text', async (req, res) => {
    const { text, userId } = req.body;
    const threadId = await getOrCreateThreadForUser(userId);
  
    try {
      const prompt = `Analyze the following text and provide a summary of the key points, insights, or recommendations:
        ${text}
  
        Your summary should:
        1. Capture the main ideas and concepts presented in the text
        2. Highlight any key insights, recommendations, or conclusions
        3. Be concise and focused on the most important aspects of the text
        4. Provide a clear and coherent summary that reflects the content accurately
        5. Avoid repeating verbatim text from the input
  
        Always respond using the following format:

        Summary:
        [Your summary here]
        ...
        `;
  
    //   const response = await openaiClient.chat.completions.create({        
    //     model: "gpt-4o",
    //     messages:[
    //       { role: "system", content: "You are an AI assistant specialized in summarizing text." },
    //       { role: "user", content: prompt }
    //     ] }
    //   );
  
    //   const summary = response.choices[0].message.content;
    await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
            const summary = assistantMessage.content[0].text.value;
  
      res.status(200).json({ summary });
    } catch (error) {
        console.error('Error analyzing text:', error);
        res.status(500).send('Error analyzing text');
    }
    });
//////////////////////////////////
// Endpoint to list Azure resources
app.post('/list-resources', async (req, res) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    return res.status(400).send('Subscription ID is required.');
  }

  try {
    const client = new ResourceManagementClient(credential, subscriptionId);
    const resources = [];

    for await (const resource of client.resources.list()) {
      resources.push(resource);
    }

    res.status(200).json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).send('Error fetching Azure resources');
  }
});

// Endpoint to upload best practices
app.post('/upload-best-practices', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobName = `best-practices-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(req.file.buffer, req.file.size);

    res.status(200).json({ message: 'File uploaded successfully', blobUrl: blockBlobClient.url });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file');
  }
});

// Endpoint to extract components using GPT
app.post('/extract-components', upload.single('diagram'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const { resources } = req.body;

  if (!resources) {
    return res.status(400).send('Resource list is required.');
  }

  try {
    const imageBuffer = await sharp(req.file.buffer).jpeg().toBuffer();
    const analysis = await extractComponentsGPT(imageBuffer, JSON.parse(resources));
    validateComponentStructure(analysis);
    res.status(200).json({ analysis });
  } catch (error) {
    console.error('Error analyzing architecture:', error);
    res.status(500).send(`Error analyzing architecture: ${error.message}`);
  }
});

// Endpoint to validate component structure
app.post('/validate-component-structure', async (req, res) => {
  const { components } = req.body;

  try {
    validateComponentStructure(components);
    res.status(200).send('Component structure is valid.');
  } catch (error) {
    console.error('Error validating component structure:', error);
    res.status(500).send(`Error validating component structure: ${error.message}`);
  }
});

// Endpoint to analyze architecture
// app.post('/analyze-architecture', upload.single('diagram'), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).send('No file uploaded.');
//   }

//   const { resources } = req.body;

//   if (!resources) {
//     return res.status(400).send('Resource list is required.');
//   }

//   try {
//     const imageBuffer = await sharp(req.file.buffer).jpeg().toBuffer();
//     const analysis = await extractComponentsGPT(imageBuffer, JSON.parse(resources));
//     validateComponentStructure(analysis);
//     res.status(200).json({ analysis });
//   } catch (error) {
//     console.error('Error analyzing architecture:', error);
//     res.status(500).send(`Error analyzing architecture: ${error.message}`);
//   }
// });



/// Endpoint to estimate resilience score
app.post('/estimate-resilience-score', async (req, res) => {
  const { userId, analysis, resources } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const resilienceScore = await estimateResilienceScore(threadId, analysis, resources);
    res.status(200).json({ resilienceScore });
  } catch (error) {
    console.error('Error estimating resilience score:', error);
    res.status(500).send(`Error estimating resilience score: ${error.message}`);
  }
});

async function estimateResilienceScore(threadId, analysis, resources) {
  const scorePrompt = `Based on this analysis, calculate a resilience score from 0-100 and explain your reasoning:\n${analysis}\n${resources}
   The resilience score should reflect the overall resilience of the architecture, considering factors such as RTO, RPO, availability SLI, and the identified resilience measures. Provide a detailed explanation of the score and the key factors that influenced it.
   provide a detailed breakdown of the resilience score, including the impact of each factor on the overall score. Be specific and provide clear reasoning for each factor's contribution to the score.

   Format your response as follows:
    ### Resilience score: [Score]
    ### Rationale: [Explanation of the score]
    ### Factors:
    1. [Factor 1]: [Explanation of the impact on the score]
    2. [Factor 2]: [Explanation of the impact on the score]
    ...
    ### Calculation: [Detailed breakdown of the score calculation]
    ### Recommendations: [Suggestions for improving the resilience score]
    ### Bottlenecks: [Identified bottlenecks affecting the resilience score]
    ### Single Points of Failure: [Identified SPOFs and their impact on the score]
    ### Summary: [Summary of the key points influencing the resilience score]


  `;
  await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: scorePrompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
            const resilienceScore= assistantMessage.content[0].text.value;
            console.log("======================================================================");
            console.log(resilienceScore);
  return resilienceScore;
}

/// Endpoint to perform resilience analysis
app.post('/perform-resilience-analysis', async (req, res) => {
  const { userRequirements, rto, rpo, availabilitySli, componentsGpt, userId, resources } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const analysis = await performResilienceAnalysis(userRequirements, rto, rpo, availabilitySli, componentsGpt, threadId, resources);
    res.status(200).json({ analysis });
  } catch (error) {
    console.error('Error performing resilience analysis:', error);
    res.status(500).send(`Error performing resilience analysis: ${error.message}`);
  }
});
async function performResilienceAnalysis(userRequirements, rto, rpo, availabilitySli, componentsGpt, threadId, resources) {
  const analysisPrompt = `
    Analyze the following architecture graph and provide a detailed resilience analysis:
    ${componentsGpt} 
    current resources: ${resources}
    Consider these requirements:
    RTO: ${rto}
    RPO: ${rpo}
    Availability SLI: ${availabilitySli}
    user requirements: ${userRequirements}
    Provide a detailed analysis of the current architecture's resilience.
    and a detailed breakdown of:
    1. All Azure services currently in use
    2. Zonal vs. regional deployments for each service
    3. Existing resilience measures (e.g., load balancers, availability sets)
    4. Current scaling configurations
    5. Existing monitoring and alerting setups

    Be specific and avoid making assumptions about services not explicitly mentioned in the configuration.
  `;
  await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: analysisPrompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
            const analysis= assistantMessage.content[0].text.value;
            console.log(analysis);
            io.emit('final-analysis', ` performResilienceAnalysis:  ${analysis}`);
  return analysis;
}

/// Endpoint to generate resiliency recommendations
app.post('/generate-resiliency-recommendations', async (req, res) => {
  console.log(req.body);
  const { userRequirements, rto, rpo, availabilitySli, componentsGpt, userId, analysis, resources, resourceAnalysis, type } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const recommendations = await generateResiliencyRecommendations(userRequirements, rto, rpo, availabilitySli, componentsGpt, threadId, analysis, resources, resourceAnalysis, type);
    res.status(200).json({ recommendations });
  } catch (error) {
    console.error('Error generating resiliency recommendations:', error);
    res.status(500).send(`Error generating resiliency recommendations: ${error.message}`);
  }
});
async function generateResiliencyRecommendations(userRequirements, rto, rpo, availabilitySli, componentsGpt, threadId, analysis, resources, resourceAnalysis, type) {
  const recommendationPrompts = {
    local: `Provide up to 30 most relevant resiliency recommendations based on local best practices files only and explain the steps to execute each recommendation,
            for the following architecture graph ${componentsGpt} and its detailed resilience analysis ${analysis}:
            Consider these requirements:
            RTO: ${rto}
            RPO: ${rpo}
            Availability SLI: ${availabilitySli}
            user requirements: ${userRequirements}
            resources: ${resources}
            Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
            In your analysis:
            1. Focus only on Azure services mentioned in the configuration analysis
            2. Prioritize high-impact recommendations (aim for about 20)
            3. Be specific about which services each recommendation applies to
            4. Include detailed, correct implementation steps for each recommendation
            5. Consider zonal and regional deployment options where relevant
            6. Only recommend changes or additions, not services already implemented
            7. Ensure all recommendations are directly related to improving resilience
            8. Identify potential single points of failure
            9. Assess the current level of redundancy and fault tolerance
            10. Evaluate the scalability of the architecture
            11. Consider the impact of zonal vs. regional deployments on resilience
            12. Assess the adequacy of current monitoring and alerting for resilience
            13. Provide recommendations for optimal resilience and fault tolerance in Azure
            14. Explain the steps to execute each recommendation and be specific to Azure services.
            15. Provide a clear rationale for each recommendation based on the architecture and requirements.
            16. Avoid discussing security, compliance, or non-resilience related aspects.
            17. Avoid vague or generic recommendations.
            18. Focus on high-impact recommendations.
            19. Provide detailed implementation steps for each recommendation.
            20. Be specific about which services each recommendation applies to. Do not say All services, instead list all the specific services.
            21. ***validate the recommendations to ensure the implementation steps are accurate and feasible***.

            Focus only on resilience-related aspects and avoid discussing security, compliance, or non-Azure solutions.
            Extract the steps and the cost associated with each recommendation.
            For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
            1) The steps to execute the recommendation
                Give the steps in a clear and concise manner.
            2) The cost associated with the recommendation
                Output cost as High, Medium or Low.
            3) The effort required to execute the recommendation.
                Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
            4) The impact of the task on the system.
                Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.

            Format each recommendation as follows:
            Recommendation: [Brief title]
            Target Service: [Specific Azure service]
            Impact: [High/Medium/Low]
            Cost: [High/Medium/Low]
            Effort: [High/Medium/Low]
            Rationale: [Brief explanation]
            Details: [Detailed explanation]
            List of resources: [Azure resources for configuration]
            Implementation Steps:
            1. [Step 1]
            2. [Step 2]
            ...`,
    web: `Provide up to 30 most relevant resiliency recommendations based on the latest web data only and explain the steps to execute each recommendation,
          for the following architecture graph ${componentsGpt} and its detailed resilience analysis ${analysis}:
          Consider these requirements:
          RTO: ${rto}
          RPO: ${rpo}
          Availability SLI: ${availabilitySli}
          user requirements: ${userRequirements}
          Resources: ${resources}
          Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
          In your analysis:
          1. Focus only on Azure services mentioned in the configuration analysis
          2. Prioritize high-impact recommendations (aim for about 20)
          3. Be specific about which services each recommendation applies to
          4. Include detailed, correct implementation steps for each recommendation
          5. Consider zonal and regional deployment options where relevant
          6. Only recommend changes or additions, not services already implemented
          7. Ensure all recommendations are directly related to improving resilience
          8. Identify potential single points of failure
          9. Assess the current level of redundancy and fault tolerance
          10. Evaluate the scalability of the architecture
          11. Consider the impact of zonal vs. regional deployments on resilience
          12. Assess the adequacy of current monitoring and alerting for resilience
          13. Provide recommendations for optimal resilience and fault tolerance in Azure
          14. Explain the steps to execute each recommendation and be specific to Azure services.
          15. Provide a clear rationale for each recommendation based on the architecture and requirements.
          16. Avoid discussing security, compliance, or non-resilience related aspects.
          17. Avoid vague or generic recommendations.
          18. Focus on high-impact recommendations.
          19. Provide detailed implementation steps for each recommendation.
          20. Be specific about which services each recommendation applies to. Do not say All services, instead list all the specific services.
          21. ***validate the recommendations to ensure the implementation steps are accurate and feasible***.

          Focus only on resilience-related aspects and avoid discussing security, compliance, or non-Azure solutions.
          Extract the steps and the cost associated with each recommendation.
          For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
          1) The steps to execute the recommendation
              Give the steps in a clear and concise manner.
          2) The cost associated with the recommendation
              Output cost as High, Medium or Low.
          3) The effort required to execute the recommendation.
              Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
          4) The impact of the task on the system.
              Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.

          Format each recommendation as follows:
          Recommendation: [Brief title]
          Target Service: [Specific Azure service]
          Impact: [High/Medium/Low]
          Cost: [High/Medium/Low]
          Effort: [High/Medium/Low]
          Rationale: [Brief explanation]
          Details: [Detailed explanation]
          List of resources: [Azure resources for configuration]
          Implementation Steps:
          1. [Step 1]
          2. [Step 2]
          ...`,
    combined: `Provide up to 30 most relevant resiliency recommendations based on both local best practices files and web data and explain the steps to execute each recommendation,
               for the following architecture graph ${componentsGpt} and its detailed resilience analysis ${analysis}:
               Consider these requirements:
               RTO: ${rto}
               RPO: ${rpo}
               Availability SLI: ${availabilitySli}
               user requirements: ${userRequirements}
                Resources: ${resources}
                Resilience Analysis  and properties for each of the above resource: ${JSON.stringify(resourceAnalysis)}
               For your recommendations:
               1. Focus only on Azure services mentioned in the configuration analysis
               2. Prioritize high-impact recommendations (aim for about 20)
               3. Be specific about which services each recommendation applies to
               4. Include detailed, correct implementation steps for each recommendation
               5. Consider zonal and regional deployment options where relevant
               6. Only recommend changes or additions, not services already implemented
               7. Ensure all recommendations are directly related to improving resilience
               8. Identify potential single points of failure
               9. Assess the current level of redundancy and fault tolerance
               10. Evaluate the scalability of the architecture
               11. Consider the impact of zonal vs. regional deployments on resilience
               12. Assess the adequacy of current monitoring and alerting for resilience
               13. Provide recommendations for optimal resilience and fault tolerance in Azure
               14. Explain the steps to execute each recommendation and be specific to Azure services.
               15. Provide a clear rationale for each recommendation based on the architecture and requirements.
               16. Avoid discussing security, compliance, or non-resilience related aspects.
               17. Avoid vague or generic recommendations.
               18. Focus on high-impact recommendations.
               19. Provide detailed implementation steps for each recommendation.
               20. Be specific about which services each recommendation applies to. Do not say All services, instead list all the specific services.
               21. ***validate the recommendations to ensure the implementation steps are accurate and feasible***.

               Focus only on resilience-related aspects and avoid discussing security, compliance, or non-Azure solutions.
               Extract the steps and the cost associated with each recommendation.
               For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
               1) The steps to execute the recommendation
                   Give the steps in a clear and concise manner.
               2) The cost associated with the recommendation
                   Output cost as High, Medium or Low.
               3) The effort required to execute the recommendation.
                   Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
               4) The impact of the task on the system.
                   Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.

               Format each recommendation as follows:
               Recommendation: [Brief title]
               Target Service: [Specific Azure service]
               Impact: [High/Medium/Low]
               Cost: [High/Medium/Low]
               Effort: [High/Medium/Low]
               Rationale: [Brief explanation]
               Details: [Detailed explanation]
               List of resources: [Azure resources for configuration]
               Implementation Steps:
               1. [Step 1]
               2. [Step 2]
               ...`
  };
let prompt = '';
  if (type === 'local') {
    prompt = recommendationPrompts.local;
  } else if (type === 'web') {
    prompt = recommendationPrompts.web;
  } else if (type === 'combined') {
    prompt = recommendationPrompts.combined;
  } else {
    prompt = recommendationPrompts.combined;
  }
  await openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
  // Run the Assistant
      const run = await openaiClient.beta.threads.runs.create(threadId, {
          assistant_id: ASSISTANT_ID,
      });
  
      // Wait for the run to complete
      let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
      while (runStatus.status !== 'completed') {
          await new Promise(r => setTimeout(r, 1000));
          runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
      }
  
      // Retrieve the messages
      const messages = await openaiClient.beta.threads.messages.list(threadId);
  
      // Get the latest message from the assistant
      const assistantMessage = messages.data
          .filter(message => message.role === 'assistant')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  
      let response= assistantMessage.content[0].text.value;
      io.emit('final-analysis', ` generateResiliencyRecommendations:  ${response}`);
      console.log(response);
  return response;


}

/// Endpoint to calculate expert analysis
app.post('/calculate-expert-analysis', async (req, res) => {
  const { componentsGpt, userId, combinedRec, type } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);
  

  try {
    const expertAnalysis = await calculateExpertAnalysis(componentsGpt, threadId, combinedRec, type);
    res.status(200).json({ expertAnalysis });
  } catch (error) {
    console.error('Error calculating expert analysis:', error);
    res.status(500).send(`Error calculating expert analysis: ${error.message}`);
  }
});
async function addMessageToThread(threadId, message) {
  const maxRetries = 5;
  const retryDelay = 20000; // milliseconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Adding message to thread: ${message} attempt ${attempt + 1}`);
      return await openaiClient.beta.threads.messages.create(threadId,{
        role: "user",
        content: message
      });
    } catch (error) {
      if (error.message.includes("Can't add messages to thread while a run is active")) {
        if (attempt < maxRetries - 1) {
          console.log(`Run is active. Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.log("Max retries reached. Please check for any hanging runs.");
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}
async function createAgent(threadId, prompt) {
  await addMessageToThread(threadId, prompt);
  // Run the Assistant
  const run = await openaiClient.beta.threads.runs.create(threadId, {
    assistant_id: ASSISTANT_ID,
  });

  // Wait for the run to complete
  let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
  while (runStatus.status !== 'completed') {
    //console.log('Run status:', runStatus.status);
    await new Promise(r => setTimeout(r, 1000));
    runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
  }

  // Retrieve the messages
  const messages = await openaiClient.beta.threads.messages.list(threadId);

  // Get the latest message from the assistant
  const assistantMessage = messages.data
    .filter(message => message.role === 'assistant')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  const response = assistantMessage.content[0].text.value;
  //console.log(response);
}

async function calculateExpertAnalysis(componentsGpt, threadId, combinedRec, type) {
  
  const expertPrompts = {
    cost_estimator: `for the following architecture graph ${componentsGpt}, Estimate costs and effort for implementing each of these recommendations:\n${combinedRec}
    In your analysis, consider the following aspects:
    1. The cost of each recommendation
    2. The effort required to implement each recommendation
    3. The potential cost savings or benefits of each recommendation
    4. The cost-effectiveness of each recommendation
    5. The overall cost impact of implementing all recommendations
    6. The potential return on investment for each recommendation
    7. The cost implications of zonal vs. regional deployments
    8. The cost implications of scaling up or down based on the recommendations
    9. The cost implications of monitoring and alerting setups
    10. The cost implications of autoscaling configurations
    11. The cost implications of redundancy and fault tolerance measures
    12. The cost implications of resilience improvements
    13. For each recommendation, provide a detailed breakdown of the cost and effort required to implement the recommendation. Consider the impact of each recommendation on the overall cost and effort of the system.
    14. Ensure that your analysis is specific to Azure services and configurations. Avoid discussing non-Azure solutions or services.
    15. Focus only on cost and effort estimates and avoid discussing security, compliance, or non-resilience related aspects.
    16. Extract the steps and the cost associated with each recommendation.
    For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
    1) The steps to execute the recommendation
        Give the steps in a clear and concise manner.
    2) The cost associated with the recommendation
        Output cost as High, Medium or Low.
    3) The effort required to execute the recommendation.
        Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
    4) The impact of the task on the system.
        Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.
    Format each recommendation as follows:
    Recommendation: [Brief title]
    Target Service: [Specific Azure service]
    Impact: [High/Medium/Low]
    Cost: [High/Medium/Low]
    Effort: [High/Medium/Low]
    Rationale: [Brief explanation]
    Details: [Detailed explanation]
    Potential cost savings/Benefits: [Brief explanation]
    Cost-effectiveness: [Brief explanation]
    Implementation Steps:
    1. [Step 1]
    2. [Step 2]
    ...
  
    `,

    security_expert: `for the following architecture graph ${componentsGpt}, Analyze each of these recommendations from a security perspective and suggest improvements:\n${combinedRec}
    In your analysis, consider the following aspects:
    1. The security implications of each recommendation
    2. The potential security risks and vulnerabilities addressed by each recommendation
    3. The impact of each recommendation on the system's security posture
    4. The alignment of each recommendation with security best practices
    5. The potential security benefits of each recommendation
    6. The security implications of zonal vs. regional deployments
    7. The security implications of scaling up or down based on the recommendations
    8. The security implications of monitoring and alerting setups
    9. The security implications of autoscaling configurations
    10. The security implications of redundancy and fault tolerance measures
    11. The security implications of resilience improvements
    12. For each recommendation, provide a detailed breakdown of the security implications and benefits. Consider the impact of each recommendation on the overall security posture of the system.
    13. Ensure that your analysis is specific to Azure services and configurations. Avoid discussing non-Azure solutions or services.
    14. Focus only on security implications and benefits and avoid discussing cost, performance, or non-resilience related aspects.
    15. Extract the steps and the cost associated with each recommendation.
    For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
    1) The steps to execute the recommendation

        Give the steps in a clear and concise manner.
    2) The cost associated with the recommendation
        Output cost as High, Medium or Low.
    3) The effort required to execute the recommendation.
        Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
    4) The impact of the task on the system.
        Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.
    Format each recommendation as follows:
    Recommendation: [Brief title]
    Target Service: [Specific Azure service]
    Impact: [High/Medium/Low]
    Cost: [High/Medium/Low]
    Effort: [High/Medium/Low]
    Rationale: [Brief explanation]
    Details: [Detailed explanation]
    Potential security benefits: [Brief explanation]
    Security implications: [Brief explanation]
    Implementation Steps:
    1. [Step 1]
    2. [Step 2]
    ...    
    `,

    performance_expert: `for the following architecture graph ${componentsGpt}, Analyze each of these recommendations from a performance perspective and suggest improvements:\n${combinedRec}
    In your analysis, consider the following aspects:
    1. The performance implications of each recommendation
    2. The potential performance bottlenecks addressed by each recommendation
    3. The impact of each recommendation on the system's performance
    4. The alignment of each recommendation with performance best practices
    5. The potential performance benefits of each recommendation
    6. The performance implications of zonal vs. regional deployments
    7. The performance implications of scaling up or down based on the recommendations
    8. The performance implications of monitoring and alerting setups
    9. The performance implications of autoscaling configurations
    10. The performance implications of redundancy and fault tolerance measures
    11. The performance implications of resilience improvements
    12. For each recommendation, provide a detailed breakdown of the performance implications and benefits. Consider the impact of each recommendation on the overall performance of the system.
    13. Ensure that your analysis is specific to Azure services and configurations. Avoid discussing non-Azure solutions or services.
    14. Focus only on performance implications and benefits and avoid discussing cost, security, or non-resilience related aspects.
    15. Extract the steps and the cost associated with each recommendation.
    For each of the recommendations, you need to provide the following information. Do not add any text other than the information required:
        1) The steps to execute the recommendation
        Give the steps in a clear and concise manner.
        2) The cost associated with the recommendation
        Output cost as High, Medium or Low.
        3) The effort required to execute the recommendation.
        Output effort as High, Medium or Low. You can derive this from the number of steps required to execute the recommendation.
        4) The impact of the task on the system.
        Output impact as High, Medium or Low. You can derive this from the number of services affected by the recommendation.
    Format each recommendation as follows:
        Recommendation: [Brief title]
        Target Service: [Specific Azure service]
        Impact: [High/Medium/Low]
        Cost: [High/Medium/Low]
        Effort: [High/Medium/Low]
        Rationale: [Brief explanation]
        Details: [Detailed explanation]
        Potential performance benefits: [Brief explanation]
        Performance implications: [Brief explanation]
        Implementation Steps:
        1. [Step 1]
        2. [Step 2]
        ...    
    `

  };
  let prompt = '';
 if (type === 'costEstimate') {
  prompt = expertPrompts.cost_estimator;
} else if (type === 'securityAnalysis') {
  prompt = expertPrompts.security_expert;
} else if (type === 'performanceAnalysis') {
  prompt = expertPrompts.performance_expert;
} else {
  prompt = expertPrompts.cost_estimator;
}
 openaiClient.beta.threads.messages.create(threadId, { role: "user", content: prompt });
        // Run the Assistant
            const run = await openaiClient.beta.threads.runs.create(threadId, {
                assistant_id: ASSISTANT_ID,
            });
        
            // Wait for the run to complete
            let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            while (runStatus.status !== 'completed') {
                await new Promise(r => setTimeout(r, 1000));
                runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
            }
        
            // Retrieve the messages
            const messages = await openaiClient.beta.threads.messages.list(threadId);
        
            // Get the latest message from the assistant
            const assistantMessage = messages.data
                .filter(message => message.role === 'assistant')
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
            const expertAnalysis= assistantMessage.content[0].text.value;
            console.log(expertAnalysis);
            io.emit('final-analysis', ` calculateExpertAnalysis:  ${expertAnalysis}`);
  return expertAnalysis;
}

/// Endpoint to generate clarifying questions
app.post('/generate-clarifying-questions', async (req, res) => {
  const { componentsGpt, userId, combinedRec, costEstimate, securityAnalysis, performanceAnalysis } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const questions = await generateClarifyingQuestions(componentsGpt, threadId, combinedRec, costEstimate, securityAnalysis, performanceAnalysis);
    res.status(200).json({ questions });
  } catch (error) {
    console.error('Error generating clarifying questions:', error);
    res.status(500).send(`Error generating clarifying questions: ${error.message}`);
  }
});
async function generateClarifyingQuestions(componentsGpt, threadId, combinedRec, costEstimate, securityAnalysis, performanceAnalysis) {
  const questionPrompt = `Generate relevant clarifying questions about the recommendations provided based on the system architecture and resources provided.
                          Current architecture: ${componentsGpt}
                          Cost estimate: ${costEstimate}
                          Security analysis: ${securityAnalysis}
                          Performance analysis: ${performanceAnalysis}
                          Recommendations: ${combinedRec}

                          Generate questions that:
                          1. Clarify specific details about the current Azure services and their configurations
                          2. Address potential gaps in the resilience strategy
                          3. Explore the customer's specific resilience requirements or SLAs
                          4. Investigate any ambiguities about zonal or regional deployments
                          5. Seek more information about current monitoring, alerting, or autoscaling setups for specific services
                          6. Ensure valid and relevant questions that can help refine the recommendations.
                          7. Seek additional details about the impact, cost, and effort of each recommendation.
                          Ensure all questions are directly related to Azure services and resilience aspects.`;

  const clarifyingQuestionsAnswers = await createAgent(threadId, questionPrompt);
  return clarifyingQuestionsAnswers;
}

/// Endpoint to suggest best recommendations
app.post('/suggest-best-recommendations', async (req, res) => {
  const { componentsGpt, userId, analysis, localRec, webRec, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, clarifyingQuestionsAnswers } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const recommendations = await suggestBestRecommendations(componentsGpt, threadId, analysis, localRec, webRec, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, clarifyingQuestionsAnswers);
    res.status(200).json({ recommendations });
  } catch (error) {
    console.error('Error suggesting best recommendations:', error);
    res.status(500).send(`Error suggesting best recommendations: ${error.message}`);
  }
});
async function suggestBestRecommendations(componentsGpt, threadId, analysis, localRec, webRec, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, clarifyingQuestionsAnswers) {
  const comparisonPrompt = `for the following architecture graph ${componentsGpt} and its detailed resilience analysis ${analysis}:
                            Compare and evaluate these recommendations and expert analyses:
                            Local recommendations: ${localRec}
                            Web-based recommendations: ${webRec}
                            Combined recommendations: ${combinedRec}
                            User response to clarifying question: ${clarifyingQuestionsAnswers}
                            Cost estimate: ${costEstimate}
                            Security analysis: ${securityAnalysis}
                            Performance analysis: ${performanceAnalysis}
                            Provide a comprehensive comparison and suggest the best overall recommendations for improving the system's resilience. Order them based on impact, where higher impact ones are listed first. High impact recommendations should not exceed 20.
                            Consider the trade-offs between resilience, cost, security, and performance.
                            In your updated recommendations:
                            1. Refine existing recommendations based on the new information
                            2. Add new recommendations if the user responses reveal additional needs
                            3. Remove or modify any recommendations that are no longer applicable
                            4. Ensure all recommendations remain specific to Azure services and directly related to resilience
                            5. Maintain the focus on high-impact recommendations (aim for about 20)
                            6. Provide detailed, correct implementation steps for each recommendation
                            7. Consider zonal and regional aspects where relevant
                            8. Ensure all recommendations are actionable and directly related to improving resilience
                            9. Verify that the recommendations are valid and relevant to the system
                            10. Ensure the recommendations are not too noisy and do not generate false positives
                            11. Verify the correctness of all the details provided in the recommendations
                            12. Focus on high-impact recommendations
                            13. The recommendations should be directly related to improving resilience and fault tolerance
                            14. Provide a detailed plan for implementation based on the Azure documentation

                            Format each recommendation as in the initial recommendation phase. Do not ask any questions in this response.`;

  const finalRecommendations = await createAgent(threadId, comparisonPrompt);
  return finalRecommendations;
}

/// Endpoint to perform chaos engineering
app.post('/chaos-engineering', async (req, res) => {
  const { userId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const chaosAnalysis = await chaosEngineering(threadId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements);
    res.status(200).json({ chaosAnalysis });
    io.emit('final-analysis', ` chaosEngineering:  ${chaosAnalysis}`);
  } catch (error) {
    console.error('Error performing chaos engineering:', error);
    res.status(500).send(`Error performing chaos engineering: ${error.message}`);
  }
});
async function chaosEngineering(threadId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements) {
  const chaosPrompt = `Based on the final recommendations, suggest up to 30 most relevant faults to simulate failure scenarios and test the system's resilience and fault tolerance.
                       Current architecture: ${componentsGpt}
                       Combined recommendations: ${combinedRec}
                       Cost estimate: ${costEstimate}
                       Security analysis: ${securityAnalysis}
                       Performance analysis: ${performanceAnalysis}
                       Considering these requirements:
                       RTO: ${rto}
                       RPO: ${rpo}
                       Availability SLI: ${availabilitySli}
                       user requirements: ${userRequirements}
                       Only recommend faults related to the system's resilience and for only the components given.
                       In your analysis:
                       1. Focus on Azure services and resilience-related aspects only.
                       2. Prioritize high-impact faults that can reveal potential weaknesses in the architecture.
                       3. Be specific about which services each fault applies to.
                       4. Provide detailed, correct implementation steps for each fault.
                       5. Consider zonal and regional deployment options where relevant.
                       6. Only recommend faults that are directly related to improving resilience.
                       7. Provide a detailed plan for fault injection and testing in Azure based on the Azure documentation.
                       8. Ensure all faults are actionable and provide clear steps for resolution.
                        9. Verify that the faults are valid and relevant to the system.
                        10. Ensure that the faults are not too noisy and do not generate false positives.
                        11. Verify the correctness of all the details provided in the faults and filter them out if they are not relevant.
                        12. Focus on high-impact faults.
                        13. The faults should be directly related to improving resilience and fault tolerance.
                       ----------------
                       Format each alert as follows:
                        Fault: [Brief title]
                        Target Service: [Specific Azure service]
                        Impact: [High/Medium/Low]
                        Cost: [High/Medium/Low]
                        Effort: [High/Medium/Low]
                        Rationale: [Brief explanation]
                        Details: [Detailed explanation]
                        Steps to Execute:
                        1. [Step 1]
                        2. [Step 2]
                        ...
                        Expected Outcomes:
                        1. [Outcome 1]
                        2. [Outcome 2]
                        ...
                        Documentation Reference: [Azure Documentation Reference for Fault Injection]
                      ----------------
                       Here is an example of the expected format for a given fault:
                       Simulate Storage Outages for Database Backups
                       Fault: Simulate storage account failures where backups are stored.
                       Steps to Execute:
                       Use Azure Storage Accounts to store automated database backups.
                       Block access to the storage account temporarily by modifying access keys or firewall rules.
                       Monitor the database backup service for error notifications and recovery mechanisms.
                       Expected Outcomes:
                       Ensure that service alerts for inadequate backup storage promptly.
                       Verify seamless recovery and resumption of backups once storage issues are resolved.
                       Documentation Reference: Manage Storage Account Access Keys - Azure Storage | Microsoft Docs`;

  // openaiClient.beta.threads.messages.create(threadId, { role: "user", content: chaosPrompt });
  // // Run the Assistant
  //     const run = await openaiClient.beta.threads.runs.create(threadId, {
  //         assistant_id: ASSISTANT_ID,
  //     });

  //     // Wait for the run to complete
  //     let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
  //     while (runStatus.status !== 'completed') {
  //         await new Promise(r => setTimeout(r, 1000));
  //         runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
  //     }

  //     // Retrieve the messages
  //     const messages = await openaiClient.beta.threads.messages.list(threadId);

  //     // Get the latest message from the assistant
  //     const assistantMessage = messages.data
  //         .filter(message => message.role === 'assistant')
  //         .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  //     const chaosAnalysis = assistantMessage.content[0].text.value;

  const chaosAnalysis =   [
    {
      name: 'Network Latency Injection',
      description: 'Simulates network latency to test application resilience.',
      impact: 'Increased response times and potential timeouts.',
      mitigation: 'Implement retries and exponential backoff strategies.'
    },
    {
      name: 'CPU Stress Test',
      description: 'Simulates high CPU usage to test application performance under load.',
      impact: 'Decreased application performance and potential crashes.',
      mitigation: 'Optimize code and implement load balancing.'
    }
  ];

  console.log(chaosAnalysis);
  return chaosAnalysis;
}

/// Endpoint to get service health alerts
app.post('/service-health-alerts', async (req, res) => {
  const { userId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements } = req.body;
    const threadId = await getOrCreateThreadForUser(userId);

  try {
    const alerts = await serviceHealthAlerts(threadId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements);
    res.status(200).json({ alerts });
  } catch (error) {
    console.error('Error getting service health alerts:', error);
    res.status(500).send(`Error getting service health alerts: ${error.message}`);
  }
});

async function serviceHealthAlerts(threadId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements) {
  const alertsPrompt = `Provide recommendations for up to 30 most relevant service health alerts to be configured to monitor and help improve the resilience of the system based on these service health alerts.
                        Current architecture: ${componentsGpt}
                        Combined recommendations: ${combinedRec}
                        Cost estimate: ${costEstimate}
                        Security analysis: ${securityAnalysis}
                        Performance analysis: ${performanceAnalysis}
                        Considering these requirements:
                        RTO: ${rto}
                        RPO: ${rpo}
                        Availability SLI: ${availabilitySli}
                        user requirements: ${userRequirements}
                        For your recommendations:
                        1. Focus on Azure services and resilience-related aspects only.
                        2. Prioritize high-impact alerts that can help detect potential issues early.
                        3. Be specific about which services each alert applies to.
                        4. Provide detailed, correct implementation steps for each alert.
                        5. Consider zonal and regional deployment options where relevant.
                        6. Raise alerts for only the components given.
                        7. Provide a detailed plan for configuring service health alerts in Azure based on the Azure documentation.
                        8. Ensure all alerts are directly related to improving resilience.
                        9. Provide a clear rationale for each alert based on the architecture and requirements.
                        10. Avoid discussing security, compliance, or non-resilience related aspects.
                        11. Focus on high-impact alerts.
                        12. Verify that the alerts are actionable and provide clear steps for resolution.
                        13. verify that the alerts are valid and relevant to the system.
                        14. Ensure that the alerts are not too noisy and do not generate false positives.
                        15. Verify the correctness of all the details provided in the alerts and filter them out if they are not relevant.

                        Format each alert as follows:
                        Alert: [Brief title]
                        Target Service: [Specific Azure service]
                        Impact: [High/Medium/Low]
                        Cost: [High/Medium/Low]
                        Effort: [High/Medium/Low]
                        Rationale: [Brief explanation]
                        Details: [Detailed explanation]
                        Implementation Steps:
                        1. [Step 1]
                        2. [Step 2]
                        ...
                        Documentation Reference: [Azure Documentation Reference for Configuring Alerts]`;
                          openaiClient.beta.threads.messages.create(threadId, { role: "user", content: alertsPrompt });
  // Run the Assistant
      const run = await openaiClient.beta.threads.runs.create(threadId, {
          assistant_id: ASSISTANT_ID,
      });
  
      // Wait for the run to complete
      let runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
      while (runStatus.status !== 'completed') {
          await new Promise(r => setTimeout(r, 1000));
          runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
      }
  
      // Retrieve the messages
      const messages = await openaiClient.beta.threads.messages.list(threadId);
  
      // Get the latest message from the assistant
      const assistantMessage = messages.data
          .filter(message => message.role === 'assistant')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  
      const alerts = assistantMessage.content[0].text.value;
      console.log(alerts);

  return alerts;
}                   

// Endpoint to delete all assistants
// app.post('/delete-all-assistants', async (req, res) => {
//   try {
//     await deleteAllAssistants();
//     res.status(200).send('All assistants deleted successfully.');
//   } catch (error) {
//     console.error('Error deleting all assistants:', error);
//     res.status(500).send(`Error deleting all assistants: ${error.message}`);
//   }
// });

// Endpoint to process user input
app.post('/process-user-input', async (req, res) => {
  const { userId, architecture, initialAnalysis, userResponses } = req.body;
  const threadId = await getOrCreateThreadForUser(userId);

  try {
    const response = await processUserInput(threadId, architecture, initialAnalysis, userResponses);
    res.status(200).json({ response });
  } catch (error) {
    console.error('Error processing user input:', error);
    res.status(500).send(`Error processing user input: ${error.message}`);
  }
});
async function processUserInput(threadId, architecture, initialAnalysis, userResponses) {
  const userInputPrompt = `Based on the initial architecture analysis and user responses, provide a detailed analysis of the architecture and suggest improvements.
                          Current architecture: ${architecture}
                          Initial analysis: ${initialAnalysis}
                          User responses: ${userResponses}
                          Analyze the architecture and provide a detailed breakdown of:
                          1. All Azure services currently in use
                          2. Zonal vs. regional deployments for each service
                          3. Existing resilience measures (e.g., load balancers, availability sets)
                          4. Current scaling configurations
                          5. Existing monitoring and alerting setups
                          Be specific and avoid making assumptions about services not explicitly mentioned in the configuration.`;

  const response = await createAgent(threadId, userInputPrompt);
  return response;
}
//////////////////////////////////
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
