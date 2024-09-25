import React, { useState } from 'react';
import { Offcanvas, Button, Alert, Nav, Dropdown } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'bootstrap/dist/css/bootstrap.min.css';

const MarkdownSidePane = ({ content, title = "Markdown Content" }) => {
  const [show, setShow] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const renderMarkdown = (markdownContent) => {
    if (typeof markdownContent !== 'string') {
      return <Alert variant="warning">Invalid content: Expected a string, received {typeof markdownContent}</Alert>;
    }

    if (markdownContent.trim() === '') {
      return <Alert variant="info">No content to display</Alert>;
    }

    try {
      return (
        <ReactMarkdown
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {markdownContent}
        </ReactMarkdown>
      );
    } catch (err) {
      return <Alert variant="danger">Error rendering Markdown: {err.message}</Alert>;
    }
  };

  const renderTabs = (contentArray) => {
    const tabGroups = Math.ceil(contentArray.length / 4);
    
    return (
      <Nav variant="tabs" className="mb-3 flex-nowrap" >
        {[...Array(tabGroups)].map((_, groupIndex) => (
          <Dropdown key={groupIndex} as={Nav.Item}>
            <Dropdown.Toggle as={Nav.Link}>Group {groupIndex + 1}</Dropdown.Toggle>
            <Dropdown.Menu>
              {contentArray.slice(groupIndex * 4, (groupIndex + 1) * 4).map((_, index) => (
                <Dropdown.Item 
                  key={groupIndex * 4 + index}
                  active={activeTab === groupIndex * 4 + index}
                  onClick={() => setActiveTab(groupIndex * 4 + index)}
                >
                  {index == 0 ? 'Resource Details' : index == 1 ? 'Resilience Features' : index == 2 ? 'Validation' : 'Final Analysis'}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        ))}
      </Nav>
    );
  };

  const renderContent = () => {
    if (content == null) {
      return <Alert variant="info">No content provided</Alert>;
    }

    if (Array.isArray(content)) {
      if (content.length === 0) {
        return <Alert variant="info">No content to display</Alert>;
      }
      return (
        <>
          {renderTabs(content)}
          {renderMarkdown(content[activeTab])}
        </>
      );
    } else if (typeof content === 'string') {
      return renderMarkdown(content);
    } else if (typeof content === 'object') {
      return (
        <Alert variant="warning">
          Received an object. Please provide a string or an array of strings instead.
          <pre>{JSON.stringify(content, null, 2)}</pre>
        </Alert>
      );
    } else {
      return <Alert variant="danger">Unsupported content type: {typeof content}</Alert>;
    }
  };

  return (
    <>
      <Button variant="primary" onClick={handleShow} className="position-fixed bottom-0 end-0 m-4">
        View Logs
      </Button>

      <Offcanvas show={show} onHide={handleClose} placement="end" style={{width: '70%'}}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>{title}</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <div className="markdown-content" style={{ maxHeight: 'calc(100vh - 56px)', overflowY: 'auto' }}>
            {renderContent()}
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
};

export default MarkdownSidePane;
