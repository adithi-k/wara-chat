import React, { useEffect, useState } from 'react';
import { Card, Spinner } from 'react-bootstrap';
import ResilienceMarkdownCarousel from './ResilienceMarkdownCarousel';


const API_URL = 'aara-backend-aries.azurewebsites.net';//'http://localhost:5000';
const ResilienceScore = ({ userId, analysis, resources }) => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResilienceScore = async () => {
      try {
        const response = await fetch(`${API_URL}/estimate-resilience-score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ userId, analysis, resources })
        });

        if (response.ok) {
          const data = await response.json();
          setContent(JSON.stringify(data.resilienceScore));
          
        } else {
          throw new Error('Failed to fetch resilience score');
        }
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    if(userId && analysis && resources) {
        fetchResilienceScore();
    }
  }, [userId, analysis, resources]);

  if (loading) {
    return <Spinner animation="border" />;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }
  return (    
    <Card className="resilience-score-card">
      <Card.Header as="h5">Resilience score</Card.Header>
      <Card.Body>
        <Card.Text>
          <ResilienceMarkdownCarousel>{content}</ResilienceMarkdownCarousel>
        </Card.Text>
      </Card.Body>
    </Card>  
  );
};

export default ResilienceScore;