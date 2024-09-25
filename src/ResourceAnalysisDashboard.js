import React from 'react';
import { Container, Row, Col, Carousel } from 'react-bootstrap';
// import ResourceAnalysisCard from './ResourceAnalysisCard';
import { Alert } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'bootstrap/dist/css/bootstrap.min.css';

const ResourceAnalysisDashboard = ({ analysisData }) => {
  const resourceAnalyses = analysisData.split('---').filter(analysis => analysis.trim() !== '');
  const azureStyle = `
    .markdown-content {
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
      color: #323130;
      line-height: 1.5;
      text-align: left;
    }
    .markdown-content * {
      text-align: left;
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6 {
      color: #0078d4;
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      text-align: left;
    }
    .markdown-content h1 {
      font-size: 32px;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 10px;
    }
    .markdown-content h2 {
      font-size: 24px;
      border-bottom: 1px solid #eaecef;
      padding-bottom: 7px;
    }
    .markdown-content h3 {
      font-size: 20px;
    }
    .markdown-content h4 {
      font-size: 16px;
    }
    .markdown-content p {
      margin-bottom: 16px;
      text-align: left;
    }
    .markdown-content a {
      color: #0078d4;
      text-decoration: none;
    }
    .markdown-content a:hover {
      text-decoration: underline;
    }
    .markdown-content ul, .markdown-content ol {
      padding-left: 2rem;
      margin-bottom: 16px;
      text-align: left;
    }
    .markdown-content li {
      margin-bottom: 8px;
      text-align: left;
    }
    .markdown-content pre {
      background-color: #f3f2f1;
      border: 1px solid #e1dfdd;
      border-radius: 2px;
      padding: 16px;
      margin-bottom: 16px;
      overflow: auto;
      text-align: left;
    }
    .markdown-content code {
      background-color: #f3f2f1;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 85%;
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      text-align: left;
    }
    .markdown-content blockquote {
      border-left: 4px solid #0078d4;
      padding-left: 16px;
      margin-left: 0;
      color: #605e5c;
      text-align: left;
    }
    .markdown-content table {
      border-collapse: collapse;
      margin-bottom: 16px;
      width: 100%;
    }
    .markdown-content th, .markdown-content td {
      border: 1px solid #e1dfdd;
      padding: 8px 12px;
      text-align: left;
    }
    .markdown-content th {
      background-color: #f3f2f1;
      font-weight: 600;
    }
    .markdown-content img {
      max-width: 100%;
      height: auto;
    }
  `;

  const renderMarkdown = (markdownContent) => {
    if (typeof markdownContent !== 'string') {
      return <Alert variant="warning">Invalid content: Expected a string, received {typeof markdownContent}</Alert>;
    }

    if (markdownContent.trim() === '') {
      return <Alert variant="info">No content to display</Alert>;
    }

    try {
      return (
        <>
          <style>{azureStyle}</style>
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={vs}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                    customStyle={{
                      padding: '16px',
                      borderRadius: '2px',
                      fontSize: '14px',
                      backgroundColor: '#f3f2f1',
                      border: '1px solid #e1dfdd',
                      textAlign: 'left',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props} style={{textAlign: 'left'}}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {markdownContent}
          </ReactMarkdown>
        </>
      );
    } catch (err) {
      return <Alert variant="danger">Error rendering Markdown: {err.message}</Alert>;
    }
  };

  return (
    <Carousel>
        {resourceAnalyses.filter(analysis => analysis.trim() !== '' && analysis.includes('###'))
        .map((analysis, index) => (
            <Carousel.Item key={index}>
            <Container>
                <Row>
                <Col style={{ backgroundColor: '#ffffff', textAlign: 'left' }}>
                <div className="markdown-content" style={{ height: 'calc(100vh - 60px)', overflowY: 'auto', textAlign: 'left' }}>
                  {renderMarkdown(analysis)}
                </div>
                </Col>
                </Row>
            </Container>
            </Carousel.Item>
        ))}
    </Carousel>
  );
};

export default ResourceAnalysisDashboard;