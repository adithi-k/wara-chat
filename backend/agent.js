const express = require('express');
const multer = require('multer');
const { OpenAI } = require('openai');
const { ResourceGraphClient } = require('@azure/arm-resourcegraph');
const { DefaultAzureCredential } = require('@azure/identity');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const credential = new DefaultAzureCredential();
const resourceGraphClient = new ResourceGraphClient(credential);

// Function to execute ARG query
async function executeARGQuery(query, subscriptions) {
  try {
    const response = await resourceGraphClient.resources({
      query: query,
      subscriptions: subscriptions,
    });
    return response.data;
  } catch (error) {
    console.error('Error executing ARG query:', error);
    throw error;
  }
}

// Function to extract content from a URL
async function extractContentFromUrl(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    // Extract the main content (this is a simple example, might need adjustment based on the specific websites)
    return $('body').text().substring(0, 2000); // Limit to first 2000 characters
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error);
    return null;
  }
}

// OpenAI Assistants setup
let recommendationsAgent, validatorAgent, orchestratorAgent;

async function setupAssistants() {
  const argQueriesFile = await openai.files.create({
    file: fs.createReadStream('path/to/your/arg_queries.json'),
    purpose: 'assistants',
  });

  recommendationsAgent = await openai.beta.assistants.create({
    name: "Recommendations Agent",
    instructions: "You are an expert in analyzing Azure resources and providing recommendations for optimization and best practices. Use the provided file to find relevant ARG queries for resource analysis. Include relevant links to Azure documentation or best practices guides with each recommendation.",
    model: "gpt-4-1106-preview",
    tools: [{
      type: "function",
      function: {
        name: "execute_arg_query",
        description: "Execute an ARG query",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The ARG query to execute" },
            subscriptions: { type: "array", items: { type: "string" }, description: "List of Azure subscription IDs" }
          },
          required: ["query", "subscriptions"]
        }
      }
    }],
    file_ids: [argQueriesFile.id]
  });

  validatorAgent = await openai.beta.assistants.create({
    name: "Validator Agent",
    instructions: "You are responsible for validating recommendations and links provided by the Recommendations Agent. Open each link, analyze its content, and verify if it supports the associated recommendation. Provide a detailed validation report for each recommendation.",
    model: "gpt-4-1106-preview",
    tools: [{
      type: "function",
      function: {
        name: "extract_content_from_url",
        description: "Extract content from a given URL",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to extract content from" }
          },
          required: ["url"]
        }
      }
    }]
  });

  orchestratorAgent = await openai.beta.assistants.create({
    name: "Orchestrator Agent",
    instructions: "You oversee the process of generating and validating recommendations. Coordinate between the Recommendations Agent and the Validator Agent. Ensure that each recommendation is properly validated, and compile a final report that includes only the validated recommendations with their supporting evidence.",
    model: "gpt-4-1106-preview"
  });
}

setupAssistants().catch(console.error);

// Endpoint to analyze resources
app.post('/analyze-resources', async (req, res) => {
  const { resources, subscriptions } = req.body;

  try {
    // Step 1: Generate Recommendations
    const recommendationsThread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(recommendationsThread.id, {
      role: "user",
      content: `Analyze these Azure resources and provide recommendations with relevant links: ${JSON.stringify(resources)}`
    });

    let recommendationsRun = await openai.beta.threads.runs.create(recommendationsThread.id, {
      assistant_id: recommendationsAgent.id
    });

    while (recommendationsRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      recommendationsRun = await openai.beta.threads.runs.retrieve(recommendationsThread.id, recommendationsRun.id);

      if (recommendationsRun.status === 'requires_action') {
        const toolCalls = recommendationsRun.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'execute_arg_query') {
            const { query } = JSON.parse(toolCall.function.arguments);
            const queryResult = await executeARGQuery(query, subscriptions);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(queryResult)
            });
          }
        }

        await openai.beta.threads.runs.submitToolOutputs(recommendationsThread.id, recommendationsRun.id, {
          tool_outputs: toolOutputs
        });
      }
    }

    const recommendationsMessages = await openai.beta.threads.messages.list(recommendationsThread.id);
    const recommendations = recommendationsMessages.data[0].content[0].text.value;

    // Step 2: Validate Recommendations
    const validatorThread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(validatorThread.id, {
      role: "user",
      content: `Validate these recommendations and their associated links: ${recommendations}`
    });

    let validatorRun = await openai.beta.threads.runs.create(validatorThread.id, {
      assistant_id: validatorAgent.id
    });

    while (validatorRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      validatorRun = await openai.beta.threads.runs.retrieve(validatorThread.id, validatorRun.id);

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

        await openai.beta.threads.runs.submitToolOutputs(validatorThread.id, validatorRun.id, {
          tool_outputs: toolOutputs
        });
      }
    }

    const validatorMessages = await openai.beta.threads.messages.list(validatorThread.id);
    const validationResults = validatorMessages.data[0].content[0].text.value;

    // Step 3: Final Orchestration
    const orchestratorThread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(orchestratorThread.id, {
      role: "user",
      content: `Compile the final analysis based on these recommendations: ${recommendations} and validation results: ${validationResults}. Include only validated recommendations with their supporting evidence.`
    });

    let orchestratorRun = await openai.beta.threads.runs.create(orchestratorThread.id, {
      assistant_id: orchestratorAgent.id
    });

    while (orchestratorRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      orchestratorRun = await openai.beta.threads.runs.retrieve(orchestratorThread.id, orchestratorRun.id);
    }

    const finalMessages = await openai.beta.threads.messages.list(orchestratorThread.id);
    const finalAnalysis = finalMessages.data[0].content[0].text.value;

    res.json({ analysis: finalAnalysis });
  } catch (error) {
    console.error('Error in resource analysis:', error);
    res.status(500).json({ error: 'An error occurred during resource analysis' });
  }
});

// ... [rest of the server code remains the same] ...

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));