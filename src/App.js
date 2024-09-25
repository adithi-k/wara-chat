import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Carousel, Card, ListGroup, Button, Form, Modal,  } from 'react-bootstrap';
import { ThumbsUp, ThumbsDown } from 'react-feather';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import { emit } from 'process';
import ResilienceScore from './ResilienceScore';
import CostAnalysis from './CostAnalysis';
import SecurityAnalysis from './SecurityAnalysis';
import PerformanceAnalysis from './PerformanceAnalysis';
import ResourceAnalysisDashboard from './ResourceAnalysisDashboard';
import ARGQueryComponent from './ARGQueryComponent';
import MarkdownSidePane from './MarkdownSidePane';

const socket = io('https://aara-backend-aries.azurewebsites.net');//('http://localhost:5000');
const API_URL = 'https://aara-backend-aries.azurewebsites.net';//'http://localhost:5000';

function App() {
  const [userId] = useState( () => localStorage.getItem('userId') || uuidv4());
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [input, setInput] = useState('');
  const [diagram, setDiagram] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState('791f08a6-b98f-4ee3-a59d-e67d41499bff');
  const [resourceGroupId, setResourceGroupId] = useState('ea-can-testrg');
  const [resources, setResources] = useState([]);
  const [groupedResources, setGroupedResources] = useState({});
  const [fetchingResources, setFetchingResources] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsAfterFeedback, setRecommendationsAfterFeedback] = useState([]);
  const [generatingRecommendations, setGeneratingRecommendations] = useState(false);
  const [feedback, setFeedback] = useState({});
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [rpo, setRPO] = useState('1 hour');
  const [rto, setRTO] = useState('15 minutes');
  const [appSLI, setAppSLI] = useState('99%');
  const [otherRequirements, setOtherRequirements] = useState('');
  const [clearingThread, setClearingThread] = useState(false);
  const [resourceAnalysis, setResourceAnalysis] = useState(null);
  const [analyzingResources, setAnalyzingResources] = useState(false);
  const [chaosFaultInjections, setChaosFaultInjections] = useState([]);
  const [localRec, setLocalRec] = useState([]);
  const [webRec, setWebRec] = useState([]);
  const [combinedRec, setCombinedRec] = useState([]);
  const [costEstimate, setCostEstimate] = useState('');
  const [securityAnalysis, setSecurityAnalysis] = useState('');
  const [performanceAnalysis, setPerformanceAnalysis] = useState('');
  const [serviceHealthAlerts, setServiceHealthAlerts] = useState([]);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    socket.on('analysis', async (msg) => {
      setLogs((prevLog) => [...prevLog, msg]);});
      socket.on('recommendations', async (msg) => {
        setLogs((prevLog) => [...prevLog, msg]);});
        socket.on('validation', async (msg) => {
          setLogs((prevLog) => [...prevLog, msg]);});
          socket.on('final-analysis', async (msg) => {
            setLogs((prevLog) => [...prevLog, msg]);});
    socket.on('chat message', async (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
      try {
        const response = await fetch(`${API_URL}/Analyze-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            text: msg,
            userId: userId,
          }),
        });
        if (response.ok) {
          const result = await response.json();
          setMessages((prevMessages) => [...prevMessages, result.summary]);
        }else{
          throw new Error('Failed to analyze text');
        }
      } catch (error) {
        console.error('Error analyzing text:', error);
        emit('chat message', 'Failed to analyze text. Please try again.');
        alert('Failed to analyze text. Please try again.');
      }
    });

    return () => {
      socket.off('chat message');
    };
  }, [userId]);
  useEffect(() => {
    localStorage.setItem('userId', userId);
  }, [userId]);
  useEffect(() => {
    if (resources.length > 0) {
      const grouped = resources.reduce((acc, resource) => {
        const type = resource.type || 'Unknown';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(resource);
        return acc;
      }, {});
      setGroupedResources(grouped);
    }
  }, [resources]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (input) {
      socket.emit('chat message', input);
      setInput('');
    }
  };
  const fetchRecommendations = async (type) => {
    try {
      const response = await fetch(`${API_URL}/generate-resiliency-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          userRequirements: otherRequirements,
          rto,
          rpo,
          availabilitySli: appSLI,
          componentsGpt: analysis,
          userId,
          analysis,
          resources:[],
          resourceAnalysis,
          type
        })
      });
  
      if (response.ok) {
        const data = await response.json();
        // check the response is an object with local, web, and combined recommendations else log an error
        if ( data.recommendations && type === 'local' ) {
          setLocalRec(parseRecommendations(data.recommendations));
          await fetchRecommendations('web');
        } else if ( data.recommendations && type === 'web' ) {
          setWebRec(parseRecommendations(data.recommendations));
          await fetchRecommendations('combined');
        } else if ( data.recommendations && type === 'combined' ) {
          setCombinedRec(parseRecommendations(data.recommendations));                               
          //await fetchCostSecurityPerformanceData('CostEstimate');
        } else {
          console.error('Invalid recommendations data received:', data);
        }
      } else {
        console.error('Failed to fetch local recommendations');
      }
    } catch (error) {
      console.error('Error fetching local recommendations:', error);
    } 
  };

  // Fetch recommendations for service health alerts at endpoint /service-health-alerts
  // body : userId, componentsGpt, combinedRec, costEstimate, securityAnalysis, performanceAnalysis, rto, rpo, availabilitySli, userRequirements 
  const fetchServiceHealthAlerts = async () => {
    try {
      const response = await fetch(`${API_URL}/service-health-alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },

        body: JSON.stringify({
          userId: userId,
          componentsGpt: analysis, // Assuming componentsGpt is available in your state
          combinedRec: combinedRec, // Assuming combinedRec is available in your state
          costEstimate: costEstimate, // Assuming costEstimate is available in your state
          securityAnalysis: securityAnalysis, // Assuming securityAnalysis is available in your state
          performanceAnalysis: performanceAnalysis, // Assuming performanceAnalysis is available in your state
          rto: rto,
          rpo: rpo,
          availabilitySli: appSLI,
          userRequirements: otherRequirements // Assuming userRequirements is available in your state
        })  
      });

      if (response.ok) {
        const data = await response.json();
        setServiceHealthAlerts(data.serviceHealthAlerts);
      } else {
        console.error('Failed to fetch service health alerts');
      }
    } catch (error) {
      console.error('Error fetching service health alerts:', error);
    }
  };
  const ServiceHealthAlertsCarousel = () => (
    <Carousel className="service-health-alerts-carousel">
      {serviceHealthAlerts.map((alert, index) => (
        <Carousel.Item key={index}>
          <Card className="service-health-alert-card">
            <Card.Header>{alert.name}</Card.Header>
            <Card.Body>
              <Card.Text>
                <strong>Description:</strong> {alert.description}<br />
                <strong>Impact:</strong> {alert.impact}<br />
                <strong>Mitigation:</strong> {alert.mitigation}
              </Card.Text>
            </Card.Body>
          </Card>
        </Carousel.Item>
      ))}
    </Carousel>
  );


  const fetchChaosFaultInjections = async () => {
    try {
      const response = await fetch(`${API_URL}/chaos-engineering`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          userId: userId, 
          componentsGpt: analysis, // Assuming componentsGpt is available in your state
          combinedRec: combinedRec, // Assuming combinedRec is available in your state
          costEstimate: costEstimate, // Assuming costEstimate is available in your state
          securityAnalysis: securityAnalysis, // Assuming securityAnalysis is available in your state
          performanceAnalysis: performanceAnalysis, // Assuming performanceAnalysis is available in your state
          rto: rto,
          rpo: rpo,
          availabilitySli: appSLI,
          userRequirements: otherRequirements // Assuming userRequirements is available in your state
        })
      });
  
      if (response.ok) {
        const data = await response.json();
        setChaosFaultInjections(data.chaosFaultInjections);
      } else {
        console.error('Failed to fetch chaos fault injections');
      }
    } catch (error) {
      console.error('Error fetching chaos fault injections:', error);
    }
    finally {
      await fetchServiceHealthAlerts();
    }
  };
  const ChaosFaultCarousel = () => (
    <Carousel className="chaos-fault-carousel">
      {chaosFaultInjections.map((fault, index) => (
        <Carousel.Item key={index}>
          <Card className="chaos-fault-card">
            <Card.Header>{fault.name}</Card.Header>
            <Card.Body>
              <Card.Text>
                <strong>Description:</strong> {fault.description}<br />
                <strong>Impact:</strong> {fault.impact}<br />
                <strong>Mitigation:</strong> {fault.mitigation}
              </Card.Text>
            </Card.Body>
          </Card>
        </Carousel.Item>
      ))}
    </Carousel>
  );
  const handleFeedback = (index, isLike) => {
    setCurrentFeedbackIndex(index);
    setShowFeedbackModal(true);
    setFeedback(prevFeedback => ({
      ...prevFeedback,
      [index]: { type: isLike ? 'like' : 'dislike', reason: '' }
    }));
  };
  const submitFeedback = () => {
    setFeedback(prevFeedback => ({
      ...prevFeedback,
      [currentFeedbackIndex]: { ...prevFeedback[currentFeedbackIndex], reason: feedbackReason }
    }));
    setShowFeedbackModal(false);
    setFeedbackReason('');
  };
  const analyzeResources = async () => {
    setAnalyzingResources(true);
    setProgress('Analyzing resources...');
    setResourceAnalysis('');

    const batchSize = 10; // Adjust based on your needs
    let processedResources = 0;
    let allRecommendations = [''];

    for (const [resourceType, resourceList] of Object.entries(groupedResources)) {
      for (let i = 0; i < resourceList.length; i += batchSize) {
        const batch = resourceList.slice(i, i + batchSize);
        setProgress(`Analyzing batch ${i / batchSize + 1} of ${Math.ceil(resourceList.length / batchSize)} of ResourceType ${resourceType}...`);
        
        try {
          const batchRecommendations = await fetch(`${API_URL}/analyze-resources`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ resourceType, resources:batch }),
          });
          const data = await batchRecommendations.json();
          allRecommendations = [allRecommendations[0].concat('---').concat(data.analysis)];
          setResourceAnalysis(allRecommendations[0]);
        } catch (error) {
          console.error('Error analyzing resources:', error);
          alert('Failed to analyze resources. Please try again.');
        } finally {
          setAnalyzingResources(false);
        }
        
        processedResources += batch.length;
        setProgress(`Processed ${processedResources} of ${resources.length} resources.`);
      }
    }

    setResourceAnalysis(allRecommendations);
    setProgress('Analysis complete.');
  };

   const regenerateRecommendations = async () => {
    setGeneratingRecommendations(true);
    try {
      const response = await fetch(`${API_URL}/regenerate-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          components: parseAnalysis(analysis),
          resources: resources,
          resourceAnalysis: resourceAnalysis,
          answers: answers,
          recommendations: recommendations,
          resiliencyRequirements: JSON.stringify({ rpo, rto, appSLI, otherRequirements }),
          feedback: feedback,
          userId: userId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const parsedRecommendations = parseRecommendations(result.recommendationResult);
        if (parsedRecommendations.length === 0) {
          throw new Error('No valid recommendations generated');
        }
        setRecommendationsAfterFeedback(parsedRecommendations);
        setFeedback({});  // Reset feedback for new recommendations
      } else {
        throw new Error('Failed to regenerate recommendations');
      }
    } catch (error) {
      console.error('Error regenerating recommendations:', error);
      alert('Failed to regenerate recommendations. Please try again.');
    } finally {
      setGeneratingRecommendations(false);
    }
  };
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setUploading(true);
      const formData = new FormData();
      formData.append('diagram', file);

      try {
        const response = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
        });

        if (response.ok) {
          const result = await response.json();
          const reader = new FileReader();
	      reader.onload = (event) => {
	        setDiagram(event.target.result);
	      };
	      reader.readAsDataURL(file);
        console.log('Uploaded a new architecture diagram:', result.blobUrl);
          // socket.emit('chat message', `Uploaded a new architecture diagram: ${result.blobUrl}`);
        } else {
          throw new Error('File upload failed');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file. Please try again.');
      } finally {
        setUploading(false);
      }
    } else {
      alert('Please upload a valid image file.');
    }
  };
  const fetchResources = async () => {
    if (!subscriptionId) {
      alert('Please enter a subscription ID');
      return;
    }

    setFetchingResources(true);
    try {
      const response = await fetch(`${API_URL}/fetch-resources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: resourceGroupId? JSON.stringify({subscriptionId, resourceGroupId}):JSON.stringify({ subscriptionId }),
      });

      if (response.ok) {
        const result = await response.json();
        setResources(result);
        // socket.emit('chat message', `Fetched ${result.length} resources from subscription ${subscriptionId}`);
      } else {
        throw new Error('Failed to fetch resources');
      }
    } catch (error) {
      console.error('Error fetching resources:', error);
      alert('Failed to fetch resources. Please try again.');
    } finally {
      setFetchingResources(false);
    }
  };

  const analyzeArchitecture = async () => {
    if (resources.length === 0) {
      alert('Please  fetch resources first');
      return;
    }

    setAnalyzing(true);
    try {
      const formData = new FormData();
      if(!!diagram) {
      const response = await fetch(diagram);
      const blob = await response.blob();
      formData.append('diagram', blob, 'architecture.jpg');
      }
      formData.append('resources', JSON.stringify(resources));
      formData.append('userId', userId);
      formData.append('resiliencyRequirements', JSON.stringify({ rpo, rto, appSLI, otherRequirements }));

      const analysisResponse = await fetch(`${API_URL}/analyze-architecture`, {
        method: 'POST',
        body: formData,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
      });

      if (analysisResponse.ok) {
        const result = await analysisResponse.json();
        setAnalysis(result.analysis);
        console.log('Architecture analysis completed:', result.analysis);
        //socket.emit('chat message', 'Architecture analysis completed');
      } else {
        throw new Error('Failed to analyze architecture');
      }
    } catch (error) {
      console.error('Error analyzing architecture:', error);
      alert('Failed to analyze architecture. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };
const parseAnalysis = (analysisText) => {
    const sections = {
      NODES: [],
      EDGES: [],
      PROPERTIES: [],
      'RESILIENCE ANALYSIS': {}
    };

    let currentSection = '';
    const lines = analysisText.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === '') continue;

      if (Object.keys(sections).includes(trimmedLine)) {
        currentSection = trimmedLine;
        continue;
      }

      if (currentSection && sections[currentSection]) {
        if (currentSection === 'RESILIENCE ANALYSIS') {
          const [key, ...valueParts] = trimmedLine.split(':');
          const value = valueParts.join(':').trim();
          if (key && value) {
            sections[currentSection][key.trim()] = value;
          }
        } else {
          const [key, ...valueParts] = trimmedLine.split(':');
          const value = valueParts.join(':').trim();
          if (key && value) {
            sections[currentSection].push({ key: key.trim(), value });
          }
        }
      }
    }

    return sections;
  };
  const renderAdaptiveCard = (title, data) => {
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return null;
    }

    return (
      <Card className="analysis-card">
        <Card.Header as="h5">{title}</Card.Header>
        <Card.Body>
          <ListGroup variant="flush">
            {Array.isArray(data) ? (
              data.map((item, index) => (
                <ListGroup.Item key={index}>
                  <strong>{item.key}:</strong> {item.value}
                </ListGroup.Item>
              ))
            ) : (
              Object.entries(data).map(([key, value], index) => (
                <ListGroup.Item key={index}>
                  <strong>{key}:</strong> {value}
                </ListGroup.Item>
              ))
            )}
          </ListGroup>
        </Card.Body>
      </Card>
    );
  };
  const generateQuestions = async () => {
    if (!analysis) {
      alert('Please analyze the architecture first.');
      return;
    }

    setGeneratingQuestions(true);
    try {
      const response = await fetch(`${API_URL}/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          components: parseAnalysis(analysis),
          userId: userId,
          resources: [],
          resourceAnalysis: resourceAnalysis,
          resiliencyRequirements: JSON.stringify({ rpo, rto, appSLI, otherRequirements})
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setQuestions(result.questions);
        setAnswers({});
      } else {
        throw new Error('Failed to generate questions');
      }
    } catch (error) {
      console.error('Error generating questions:', error);
      alert('Failed to generate questions. Please try again.');
    } finally {
      setGeneratingQuestions(false);
    }
  };
  const parseQuestion = (input)=> {
    // Regular expression to match the expected format
    const regex = /^### Question (\d+)\s+\[(.+?)\]:+(.*?)$/s;
  
    // Try to match the input string against the regex
    const match = input.match(regex);
  
    if (match) {
      // If there's a match, return an object with the three parts
      return {
        questionNumber: match[1],
        title: match[2],
        content: match[3].trim()
      };
    } else {
      // If the format doesn't match, return null or throw an error
      console.error("Input string does not match the expected format");
      return null;
    }
  }
  const handleAnswerChange = (questionIndex, answer) => {
    setAnswers(prevAnswers => ({
      ...prevAnswers,
      [questionIndex]: answer,
    }));
  };
  const renderQuestionCard = (question, index) => (
    <Card className="question-card">
      <Card.Header as="h5">Question {parseQuestion(question).questionNumber}</Card.Header>
      <Card.Body>
        <Card.Title>{parseQuestion(question).title}</Card.Title>
        <Card.Text>{parseQuestion(question).content}</Card.Text>
        <Form.Group>
          <Form.Control
            as="textarea"
            rows={3}
            placeholder="Your answer..."
            value={answers[index] || ''}
            onChange={(e) => handleAnswerChange(index, e.target.value)}
          />
        </Form.Group>
      </Card.Body>
    </Card>
  );
  
  const submitForRecommendations = async () => {
    if (!analysis || questions.length === 0) {
      //alert('Please analyze the architecture and generate questions first.');
      //return;
    }
    setGeneratingRecommendations(true);
    try {
      const response = await fetch(`${API_URL}/generate-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          components: analysis? parseAnalysis(analysis): "",
          resources: resources,
          resourceAnalysis: resourceAnalysis,
          answers: answers,
          resiliencyRequirements: JSON.stringify({ rpo, rto, appSLI, otherRequirements }),
          userId: userId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const parsedRecommendations = parseRecommendations(result.recommendations);
        if (parsedRecommendations.length === 0) {
          throw new Error('No valid recommendations generated');
        }
        setRecommendations(parsedRecommendations);
      } else {
        throw new Error('Failed to generate recommendations');
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      alert('Failed to generate recommendations. Please try again.');
    } finally {
      setGeneratingRecommendations(false);
      await fetchRecommendations('local'); 
    }
  };
  const parseRecommendations = (recommendationsText) => {
    if (!recommendationsText || typeof recommendationsText !== 'string') {
      console.warn('Invalid recommendations text received');
      return [];
    }
    const recommendations = recommendationsText.split('\n\n').filter(rec => rec.trim() !== '');
    return recommendations.map(rec => {
      const lines = rec.split('\n');
      const recommendation = {};
      let currentKey = '';
      lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          if (key.toLowerCase().includes('steps')) {
            currentKey = 'Steps';
            recommendation['Steps'] = [value];
          } else if (key.toLowerCase().includes('target service')) {
            recommendation['Target Service'] = value;
            currentKey = 'Target Service';
          } else if (key.toLowerCase().includes('impact')) {
            recommendation['Impact'] = value;
            currentKey = 'Impact';
          }else if (key.toLowerCase().includes('cost')) {
            recommendation['Cost'] = value;
            currentKey = 'Cost';
          } else if (key.toLowerCase().includes('effort')) {
            recommendation['Effort'] = value;
            currentKey = 'Effort';
          } else if (key.toLowerCase().includes('rationale')) {
            recommendation['Rationale'] = value;
            currentKey = 'Rationale';
          } else if (key.toLowerCase().includes('details')) {
            recommendation['Details'] = value;
            currentKey = 'Details';
          } else if (key.toLowerCase().includes('recommendation')) {
            recommendation['Recommendation'] = value;
            if(!recommendation['Recommendation']) {
              // skip empty recommendations
              return;
            }
            currentKey = 'Recommendation';
          }
          else {
            recommendation[key] = value;
            currentKey = '';
          }
        } else if (currentKey && currentKey.toLowerCase().includes('steps')) {
          recommendation[currentKey].push(line.trim());
        }
      });
      return recommendation;
    });
  };

  const renderRecommendationCard = (recommendation, index) => (
    <Card className={`recommendation-card${feedback[index]?.type === 'like' ? 'liked' : feedback[index]?.type === 'dislike' ? 'disliked' : ''}`}>
      <Card.Header as="h5">Recommendation {index + 1}: {recommendation.Recommendation || 'Untitled Recommendation'}</Card.Header>
      <Card.Body>
        <Card.Title>{recommendation.Recommendation || 'Untitled Recommendation'}</Card.Title>
        <Card.Text>
          <strong>Target Service:</strong> {recommendation['Target Service'] || 'N/A'}<br />
          <strong>Impact:</strong> {recommendation.Impact || 'N/A'}<br />
          <strong>Cost:</strong> {recommendation.Cost || 'N/A'}<br />
          <strong>Effort:</strong> {recommendation.Effort || 'N/A'}<br />
          <strong>Rationale:</strong> {recommendation.Rationale || 'N/A'}<br />
          <strong>Details:</strong> {recommendation.Details || 'N/A'}
        </Card.Text>
        <strong>Implementation Steps:</strong>
        <ListGroup variant="flush">
          {(recommendation['Steps'] || []).map((step, stepIndex) => (
            <ListGroup.Item key={stepIndex}>{step}</ListGroup.Item>
          ))}
        </ListGroup>
        <div className="feedback-buttons">
          <Button
            variant={feedback[index]?.type  === 'like' ? 'success' : 'outline-success'}
            onClick={() => handleFeedback(index, true)}
          >
            <ThumbsUp size={20} />
          </Button>
          <Button
            variant={feedback[index]?.type  === 'dislike' ? 'danger' : 'outline-danger'}
            onClick={() => handleFeedback(index, false)}
          >
            <ThumbsDown size={20} />
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
  const handleResiliencyRequirements = (e) => {
    e.preventDefault();
    // You can add validation here if needed
    console.log('Resiliency requirements submitted:', { rpo, rto, appSLI, otherRequirements });
    // You might want to trigger the analysis or recommendation generation here
  };
  const fetchCostSecurityPerformanceData = async (type) => {
    try {
      const response = await fetch(`${API_URL}/calculate-expert-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          userId: userId, // Replace with actual user ID or other necessary data
          componentsGpt: analysis, // Assuming componentsGpt is available in your state
          combinedRec: combinedRec, // Assuming combinedRec is available in your state
          type
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (type === 'CostEstimate') {
          setCostEstimate(data.expertAnalysis);
           await fetchCostSecurityPerformanceData('SecurityAnalysis');
        } else if (type === 'SecurityAnalysis') {
          setSecurityAnalysis(data.expertAnalysis);
          await fetchCostSecurityPerformanceData('PerformanceAnalysis');
        } else if (type === 'PerformanceAnalysis') {
          setPerformanceAnalysis(data.expertAnalysis);
        } else {
          console.error('Invalid analysis data received:', data);
        }
      } else {
        console.error('Failed to fetch analysis data');
      }
    } catch (error) {
      console.error('Error fetching analysis data:', error);
    } finally {      
      //await fetchChaosFaultInjections();
    }
  };
  const generateCSV = () => {
    const headers = [
      'Recommendation',
      'Target Service',
      'Impact',
      'Cost',
      'Effort',
      'Rationale',
      'Details',
      'Implementation Steps',
      'Feedback'
    ];

    const csvContent = [
      headers.join(','),
      ...[...recommendations, ...recommendationsAfterFeedback].map((rec, index) => [
        `"${rec.Recommendation || ''}"`,
        `"${rec['Target Service'] || ''}"`,
        rec.Impact || '',
        rec.Cost || '',
        rec.Effort || '',
        `"${rec.Rationale || ''}"`,
        `"${rec.Details || ''}"`,
        `"${(rec['Implementation Steps'] || []).join('; ')}"`,
        feedback[index] || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'recommendations_feedback.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  const clearThread = async () => {
    setClearingThread(true);
    try {
      const response = await fetch(`${API_URL}/clear-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        // Clear local state related to the conversation
        setAnalysis(null);
        setRecommendations([]);
        setMessages([]);
        setResources([]);
        setGroupedResources({});
        setQuestions([]);
        setAnswers({});
        setRecommendations([]);
        setRecommendationsAfterFeedback([]);
        setFeedback({});
        setDiagram(null);
        alert('Conversation thread cleared successfully');
      } else {
        throw new Error('Failed to clear thread. Please try again.');
      }
    } catch (error) {
      console.error('Error clearing thread:', error);
      alert('Failed to clear conversation thread. Please try again.');
    } finally {
      setClearingThread(false);
    }
  };
  const ResourceCarousel = () => (
    <Carousel className="resource-carousel">
      {Object.entries(groupedResources).map(([type, resourceList]) => (
        <Carousel.Item key={type}>
          <Card className="resource-card">
            <Card.Header>{type}</Card.Header>
            <Card.Body>
              <ul>
                {resourceList.map((resource, index) => (
                  <li key={index}>
                    {resource.name} - {resource.location}
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </Carousel.Item>
      ))}
    </Carousel>
  );
  return (
    <div className="app">
      <header className="app-header">
        <h1>Azure WARA Chat</h1>
        <Button 
          onClick={clearThread} 
          disabled={clearingThread}
          className="clear-thread-button"
        >
          {clearingThread ? 'Clearing...' : 'Clear Conversation'}
        </Button>
      </header>
      <div className="chat-container">
        {diagram && (
          <div className="diagram-container">
            <h2>Architecture Diagram</h2>
            <img src={diagram} alt="Architecture Diagram" className="diagram-image" />
          </div>
        )}
        <div className="file-upload">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            id="diagram-upload"
            className="file-input"
            disabled={uploading}
          />
          <label htmlFor="diagram-upload" className="file-label">
            {uploading ? 'Uploading...' : 'Upload Architecture Diagram'}
          </label>
        </div>
        {/* <div className="resource-fetch">
          <input
            type="text"
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            placeholder="Enter Subscription ID"
            className="subscription-input"
          />
        </div> */}
        <Form onSubmit={handleResiliencyRequirements} className="resiliency-form">
        <Form.Group>
          <Form.Label>Subscription ID</Form.Label>
          <Form.Control 
            type="text" 
            value={subscriptionId} 
            onChange={(e) => setSubscriptionId(e.target.value)}
            placeholder="Enter Subscription ID"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Resource Group ID</Form.Label>
          <Form.Control
            type="text"
            value={resourceGroupId}
            onChange={(e) => setResourceGroupId(e.target.value)}
            placeholder="Enter Resource Group ID"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Recovery Point Objective (RPO)</Form.Label>
          <Form.Control 
            type="text" 
            value={rpo} 
            onChange={(e) => setRPO(e.target.value)}
            placeholder="e.g., 1 hour"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Recovery Time Objective (RTO)</Form.Label>
          <Form.Control 
            type="text" 
            value={rto} 
            onChange={(e) => setRTO(e.target.value)}
            placeholder="e.g., 4 hours"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Application Service Level Indicator (SLI)</Form.Label>
          <Form.Control 
            type="text" 
            value={appSLI} 
            onChange={(e) => setAppSLI(e.target.value)}
            placeholder="e.g., 99.9%"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Other Requirements</Form.Label>
          <Form.Control 
            as="textarea" 
            rows={3}
            value={otherRequirements} 
            onChange={(e) => setOtherRequirements(e.target.value)}
            placeholder="Any other specific resiliency requirements..."
          />
        </Form.Group>
        {
          <button type = 'submit' onClick={fetchResources} disabled={fetchingResources} className="fetch-button">
            {fetchingResources ? 'Fetching...' : 'Fetch Resources'}
          </button>}
        {/* <Button type="submit">Submit Resiliency Requirements</Button> */}
      </Form>
      {/* <div className="mt-5">
            <ARGQueryComponent />
          </div> */}
  {recommendationsAfterFeedback && recommendationsAfterFeedback.length > 0 && (
          <div className="recommendations-section">
            <h2>Resilience Recommendations After Feedback</h2>
            <Carousel interval={null} className="recommendations-carousel">
              {recommendationsAfterFeedback.map((recommendation, index) => (
                <Carousel.Item key={index}>
                  {renderRecommendationCard(recommendation, index)}
                </Carousel.Item>
              ))} 
            </Carousel>
            <Button onClick={generateCSV} className="export-csv-button">
            Export Recommendations to CSV
          </Button>
          </div>
        )}
        {localRec && localRec.length > 0 && (
          <div className="recommendations-section">
            <h2>Resilience Recommendations grounded on local files</h2>
            <Carousel interval={null} className="recommendations-carousel">
              {localRec.map((recommendation, index) => (
                <Carousel.Item key={index}>
                  {renderRecommendationCard(recommendation, index)}
                </Carousel.Item>
              ))} 
            </Carousel>
            <Button onClick={generateCSV} className="export-csv-button">
            Export Recommendations to CSV
          </Button>
          </div>
        )}
        {webRec && webRec.length > 0 && (
          <div className="recommendations-section">
            <h2>Resilience Recommendations based on web</h2>
            <Carousel interval={null} className="recommendations-carousel">
              {webRec.map((recommendation, index) => (
                <Carousel.Item key={index}>
                  {renderRecommendationCard(recommendation, index)}
                </Carousel.Item>
              ))} 
            </Carousel>
            <Button onClick={generateCSV} className="export-csv-button">
            Export Recommendations to CSV
          </Button>
          </div>
        )}
        {combinedRec && combinedRec.length > 0 && (
          <div className="recommendations-section">
            <h2>Resilience Recommendations based on both web and grounded files</h2>
            <Carousel interval={null} className="recommendations-carousel">
              {combinedRec.map((recommendation, index) => (
                <Carousel.Item key={index}>
                  {renderRecommendationCard(recommendation, index)}
                </Carousel.Item>
              ))} 
            </Carousel>
            <Button onClick={generateCSV} className="export-csv-button">
            Export Recommendations to CSV
          </Button>
          </div>
        )}
        {costEstimate && (
            <CostAnalysis data={costEstimate} />)}
        {securityAnalysis && (
            <SecurityAnalysis data={securityAnalysis} />)}
        {performanceAnalysis && (
            <PerformanceAnalysis data={performanceAnalysis} />)}
	{ recommendations && recommendations.length > 0 && (
          <div className="recommendations-section">
            <h2>Resilience Recommendations</h2>
            <Carousel interval={null} className="recommendations-carousel">
              {recommendations.map((recommendation, index) => (
                <Carousel.Item key={index}>
                  {renderRecommendationCard(recommendation, index)}
                </Carousel.Item>
              ))}
            </Carousel>
            <Button onClick={generateCSV} className="export-csv-button">
            Export Recommendations to CSV
          </Button>
	  <Button onClick={regenerateRecommendations} className="regenerate-button" disabled={generatingRecommendations || Object.keys(feedback).length === 0}>
            Regenerate Recommendations
          </Button>
          </div>
        )}
	<Modal show={showFeedbackModal} onHide={() => setShowFeedbackModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Provide Feedback</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Why did you {feedback[currentFeedbackIndex]?.type === 'like' ? 'like' : 'dislike'} this recommendation?</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={feedbackReason}
              onChange={(e) => setFeedbackReason(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowFeedbackModal(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={submitFeedback}>
            Submit Feedback
          </Button>
        </Modal.Footer>
      </Modal>
    {chaosFaultInjections && chaosFaultInjections.length > 0 && (
          <div className="chaos-fault-section">
            <h2>Chaos Fault Injections</h2>
            <ChaosFaultCarousel />
            </div>
            )}
    {serviceHealthAlerts && serviceHealthAlerts.length > 0 && (        
          <div className="service-health-alerts-section">
            <h2>Service Health Alerts</h2>
            <ServiceHealthAlertsCarousel />
            </div>
            )}
	{questions && questions.length > 0 && (
          <div className="questions-section">
            <h2>Clarifying Questions</h2>
            <Carousel interval={null} className="questions-carousel">
              {questions.map((question, index) => (
                <Carousel.Item key={index}>
                  {renderQuestionCard(question, index)}
                </Carousel.Item>
              ))}
            </Carousel>
	    <Button 
              onClick={submitForRecommendations} 
              disabled={generatingRecommendations || Object.keys(answers).length <1} 
              className="submit-button"
            >
              {generatingRecommendations ? 'Generating...' : 'Submit for Recommendations'}
            </Button>
          </div>
        )}
        {analysis && (
          <div className="analysis-result">
            <h2>Architecture Graph</h2>
            <Carousel interval={null} className="analysis-carousel">
              {['NODES', 'EDGES', 'PROPERTIES', 'RESILIENCE ANALYSIS'].map((section) => {
                const card = renderAdaptiveCard(section, parseAnalysis(analysis)[section]);
                return card ? (
                  <Carousel.Item key={section}>
                    {card}
                  </Carousel.Item>
                ) : null;
              })}
            </Carousel>
            
            <h2>Resilience Score</h2>
            <ResilienceScore userId={userId} analysis={analysis} resources={resources} />
          </div>
        )}
         <div className="analyze-section">
          
         {resourceAnalysis && <ResourceAnalysisDashboard analysisData={resourceAnalysis} />}
            {progress && <div className="progress">{progress}</div>}
          {resourceAnalysis && <button 
                    onClick={analyzeArchitecture} 
                    disabled={analyzing || resources.length === 0} 
                    className="analyze-button"
                  >
                    {analyzing ? 'Analyzing...' : 'Analyze Architecture'}
                  </button>}
                  {analysis && (<button 
              onClick={submitForRecommendations} 
              disabled={generatingQuestions || !analysis} 
              className="generate-questions-button"
            >
              {generatingQuestions ? 'Generating...' : 'Generate Recommendations'}
            </button>
                  )}
          </div>
        {resources.length > 0 && (
        <div>
          <div className="resources-section">
            <h2>Azure Resources</h2>
            <ResourceCarousel />
            <Button onClick={analyzeResources} disabled={analyzingResources} className="analyze-button">
              {analyzingResources ? 'Analyzing...' : 'Analyze Resources'}
            </Button>
          </div>
        </div>
        )}  
        <div className="message-list">
          {messages.map((msg, index) => (
            <div key={index} className="message">{msg}</div>
          ))}
        </div>
        <form onSubmit={sendMessage} className="message-form">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="message-input"
          />
          <button type="submit" className="send-button">Send</button>
        </form>
        <div className="space-y-2">
             <MarkdownSidePane content={logs} title="Application Logs" />
            </div>
      </div>
    </div>
  );
}

export default App;
