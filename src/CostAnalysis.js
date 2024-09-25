
import React, { useEffect, useState } from 'react';
import { Carousel, Card, ListGroup, Button, Modal, Form} from 'react-bootstrap';
import { ThumbsUp, ThumbsDown } from 'react-feather';

const CostAnalysis = ({ data }) => {
    const [error, setError] = useState('');
    const [parsedSections, setParsedSections] = useState([]); 
     const [feedback, setFeedback] = useState({});
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(null);
    const [feedbackReason, setFeedbackReason] = useState('');

    useEffect(() => {
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
                  } else if (key.toLowerCase().includes('potential cost savings/benefits')) {
                    recommendation['Benefits'] = value;
                    currentKey = 'Benefits';
                  } else if (key.toLowerCase().includes('cost-effectiveness')) {
                    recommendation['Effectiveness'] = value;
                    currentKey = 'Effectiveness';
                  } else if (key.toLowerCase().includes('rationale')) {
                    recommendation['Rationale'] = value;
                    currentKey = 'Rationale';
                  } else if (key.toLowerCase().includes('details')) {
                    recommendation['Details'] = value;
                    currentKey = 'Details';
                  } else if (key.toLowerCase().includes('recommendation')) {
                    recommendation['Recommendation'] = value;
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
        if (data.length === 0) {
          setError('No cost analysis data found');
        }else{
          setError('');
            if (data) {
            setParsedSections(parseRecommendations(data));
            setError('');
            } else {
            setParsedSections([]);
            setError('Invalid format. Please use "###" to separate sections.');
            }
        }   

      }, [data]);
      if (typeof data !== 'string') {
        console.warn('MarkdownCarousel: data is not a string');
        return null;
      }   
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
   return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2>Cost Analysis</h2>
      {error && (
      <div variant="destructive" className="mb-4">
        <h2>Error</h2>
        <div>{error}</div>
      </div>
    )}

    {parsedSections.length > 0 ? (
      <Carousel className="w-full max-w-xs">
      {Object.entries(parsedSections).map((section, index) => (
        <Carousel.Item key={index} className="pl-1">
          <Card className={`recommendation-card${feedback[index]?.type === 'like' ? 'liked' : feedback[index]?.type === 'dislike' ? 'disliked' : ''}`}>
      <Card.Header as="h5">Recommendation {index + 1}: {section.Recommendation || 'Untitled Recommendation'}</Card.Header>
      <Card.Body>
        <Card.Title>{section.Recommendation || 'Untitled Recommendation'}</Card.Title>
        <Card.Text>
          <strong>Target Service:</strong> {section['Target Service'] || 'N/A'}<br />
          <strong>Impact:</strong> {section.Impact || 'N/A'}<br />
          <strong>Cost:</strong> {section.Cost || 'N/A'}<br />
          <strong>Effort:</strong> {section.Effort || 'N/A'}<br />
          <strong>Potential Savings/Benefits:</strong> {section.Benefits || 'N/A'}<br />
          <strong>Cost-Effectiveness:</strong> {section.Effectiveness || 'N/A'}<br />
          <strong>Rationale:</strong> {section.Rationale || 'N/A'}<br />
          <strong>Details:</strong> {section.Details || 'N/A'}
        </Card.Text>
        <strong>Implementation Steps:</strong>
        <ListGroup variant="flush">
          {(section['Steps'] || []).map((step, stepIndex) => (
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
        </Carousel.Item>
      ))}
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
      </Carousel>
    ) : (
        <div>Loading cost analysis...</div>
      )}
      
    </div>
    
  );
};

export default CostAnalysis;