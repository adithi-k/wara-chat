import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const MarkdownRenderer = ({ children }) => {
  if (typeof children !== 'string') {
    console.warn('MarkdownRenderer: children prop is not a string');
    return null;
  }

  // Remove backticks if they're wrapping the entire content
  const cleanContent = children.trim().replace(/^`+([\s\S]*?)`+$/, '$1');

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;