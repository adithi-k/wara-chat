import React from 'react';
import { Card, ListGroup, Badge } from 'react-bootstrap';

const ResourceAnalysisCard = ({ analysisData }) => {
  const parseAnalysis = (analysisText) => {
    const sections = {};
    let currentSection = 'Details';

    analysisText.split('\n').forEach(line => {
      if (line.startsWith('### ')) {
        line = line.replace('### ', '').trim();
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
            currentSection = key || 'Details';
            if (value) {
            sections[currentSection] = [value];
            } else {
                sections[currentSection] = [];
            }
        }
      } else if (line.trim() !== '' && currentSection) {
        if (!sections[currentSection]) {
          sections[currentSection] = [];
        }
        sections[currentSection].push(line);
      }else if (!currentSection) {
        console.log(line);
        }
    });

    return sections;
  };

  const parseLink = (linkString) => {
    // Check if the link is in Markdown format
    const markdownMatch = linkString.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (markdownMatch) {
      return { text: markdownMatch[1], url: markdownMatch[2] };
    }
    
    // If not Markdown, assume it's in the format "text: url"
    const colonIndex = linkString.indexOf(':');
    if (colonIndex !== -1) {
      const text = linkString.substring(0, colonIndex).trim();
      const url = linkString.substring(colonIndex + 1).trim();
      return { text, url };
    }
    
    // If neither format matches, return the whole string as text with no URL
    return { text: linkString, url: null };
  };

  const renderListItems = (items) => {
    // identify links in the list items , parseLinks and render them as links
    return items && items.length>0 && items.map((item, index) => (
        // Check if the item is a  link (contains'](http' )then extract the text and url using parseLink methos and render it as a link
          
        <ListGroup.Item key={index}>
            {item.includes('](http') ? (
                <a href={parseLink(item).url} target="_blank" rel="noopener noreferrer">
                {parseLink(item).text}
                </a>
            ) : (
               item
            )}
        </ListGroup.Item>

        ));
  };

  const renderBadge = (text) => {
    let variant = 'secondary';
    if (text.toLowerCase().includes('high')) variant = 'danger';
    if (text.toLowerCase().includes('moderate')) variant = 'warning';
    if (text.toLowerCase().includes('low')) variant = 'success';
    return <Badge variant={variant}>{text}</Badge>;
  };

  const sections = parseAnalysis(analysisData);

  return (
    <Card className="mb-4">
      <Card.Header as="h5">{ sections['Resource'] && sections['Resource'].length >0 && sections['Resource'][0]}</Card.Header>
      <Card.Body>
        <Card.Title>Resource Type</Card.Title>
        <p>{ sections['Resource Type'] && sections['Resource Type'].length > 0 &&
        sections['Resource Type'].join(' ')}</p>
        
        <Card.Title>Resilience Features</Card.Title>
        <ListGroup variant="flush" className="mb-3">
          {sections['Resilience Features'] && sections['Resilience Features'].length > 0 &&
          renderListItems(sections['Resilience Features'])}
        </ListGroup>

        <Card.Title>Utilization</Card.Title>
        <p>{ sections['Utilization'] && sections['Utilization'].length > 0 &&
        renderBadge(sections['Utilization'][0])}</p>

        <Card.Title>Recommendations</Card.Title>
        <ListGroup variant="flush" className="mb-3">
          { sections['Recommendations'] && sections['Recommendations'].length > 0 &&
          renderListItems(sections['Recommendations'])}
        </ListGroup>

        <Card.Title>ARG Query</Card.Title>
       <ListGroup variant="flush" className="mb-3">
            { sections['ARG Query'] && sections['ARG Query'].length > 0 &&
            renderListItems(sections['ARG Query'])}
        </ListGroup>

        <Card.Title>ARG Analysis</Card.Title>
        <ListGroup variant="flush" className="mb-3">
            { sections['ARG Analysis'] && sections['ARG Analysis'].length > 0 &&
            renderListItems(sections['ARG Analysis'])}
        </ListGroup>

        <Card.Title>Additional Insights</Card.Title>
        <ListGroup variant="flush" className="mb-3">
            { sections['Additional Insights'] && sections['Additional Insights'].length > 0 &&
            renderListItems(sections['Additional Insights'])}
        </ListGroup>

        <Card.Title>More details</Card.Title>
        <ListGroup variant="flush" className="mb-3">
            { sections['Details'] && sections['Details'].length > 0 &&
            renderListItems(sections['ARG Queryetails'])}
        </ListGroup>

        <Card.Title>Impact</Card.Title>
        <p>{ sections['Impact'] && sections['Impact'].length > 0 &&
        sections['Impact'].join(' ')}</p>

        <Card.Title>Targeted Azure Services</Card.Title>
        <ListGroup variant="flush" className="mb-3">
          { sections['Targeted Azure Services'] && sections['Targeted Azure Services'].length > 0 &&
          renderListItems(sections['Targeted Azure Services'])}
        </ListGroup>

        {sections['Tags'] && sections['Tags'][0] !== 'None' && (
          <>
            <Card.Title>Tags</Card.Title>
            <ListGroup variant="flush" className="mb-3">
              { sections['Tags'] && sections['Tags'].length > 0 &&
              renderListItems(sections['Tags'])}
            </ListGroup>
          </>
        )}

        <Card.Title>Properties</Card.Title>
        <ListGroup variant="flush" className="mb-3">
          { sections['Properties'] && sections['Properties'].length > 0 &&
          renderListItems(sections['Properties'])}
        </ListGroup>

        <Card.Title>Deep Links</Card.Title>
        <ListGroup variant="flush">
          { sections['Deep Links'] && sections['Deep Links'].length > 0 &&
          sections['Deep Links'].map((link, index) => {
            const { text, url } = parseLink(link);
            return (
                <ListGroup.Item key={index}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {text}
                    </a>
                  ) : (
                    text
                  )}
                </ListGroup.Item>
              );
          })}
        </ListGroup>
      </Card.Body>
    </Card>
  );
};

export default ResourceAnalysisCard;